import { NotionBlock, NotionToggleBlock, FileTreeNode, FileTreeSearchResult } from '../types';

const IS_BROWSER = typeof window !== 'undefined';
const VITE_ENV = ((import.meta as any).env || {}) as Record<string, string | boolean | undefined>;

// Same-origin endpoints served by the Cloudflare Pages Functions in
// `functions/api/`. During local development, Vite proxies `/api/*` to the
// `wrangler pages dev` server (see vite.config.ts `server.proxy`), and in
// production Cloudflare Pages serves these routes on the same origin — so no
// host/port special-casing is needed.
const API_BASE = '/api/notion';
const OAUTH_BASE = '/api/notion-oauth';

export const ROOT_PAGE_ID = String(VITE_ENV.VITE_ROOT_PAGE_ID || '');
export const NOTION_PORTFOLIO_KEY = String(VITE_ENV.VITE_NOTION_PORTFOLIO_KEY || '');
export const NOTION_OAUTH_CLIENT_ID = String(VITE_ENV.VITE_NOTION_OAUTH_CLIENT_ID || '');

export class NotionService {
  private apiKey: string;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private CACHE_TTL = 5000;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  clearCache(): void {
    this.cache.clear();
  }

  invalidateBlock(blockId: string): void {
    const cleanId = NotionService.formatUUID(blockId);
    for (const key of this.cache.keys()) {
      if (key.includes(cleanId)) this.cache.delete(key);
    }
  }

  static formatUUID(idOrUrl: string): string {
    if (!idOrUrl) return '';
    const clean = idOrUrl.replace(/-/g, '');
    const match = clean.match(/[a-fA-F0-9]{32}/);
    if (!match) return idOrUrl;
    const hex = match[0];
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  private async notionFetch(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const timestamp = Date.now();
    const url = `${API_BASE}?endpoint=${encodeURIComponent(endpoint)}&method=${method}&_t=${timestamp}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-Notion-Token'] = this.apiKey;

    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Notion API error body:', errorBody);
      throw new Error(`Notion API error (${response.status}): ${errorBody}`);
    }

    return response.json();
  }

  // Search pages accessible to the integration (for page selector after OAuth)
  async searchPages(): Promise<{ id: string; title: string; icon: string | null; lastEdited: string }[]> {
    const data = await this.notionFetch('/search', 'POST', {
      filter: { property: 'object', value: 'page' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    });
    // Filter out database rows (pages whose parent is a database) — only keep
    // top-level pages (parent is workspace or another page).
    const topLevelPages = (data.results || []).filter((page: any) => {
      const parentType = page.parent?.type;
      return parentType !== 'database_id';
    });
    return topLevelPages.map((page: any) => {
      const titleProp = page.properties?.title?.title || page.properties?.Name?.title || [];
      const title = titleProp.map((t: any) => t.plain_text).join('') || 'Untitled';
      const icon = page.icon?.emoji || page.icon?.external?.url || null;
      return { id: page.id, title, icon, lastEdited: page.last_edited_time || '' };
    });
  }

  /**
   * Create a new child page under a parent page.
   * Returns the new page id and title.
   */
  async createChildPage(parentPageId: string, title: string): Promise<{ id: string; title: string }> {
    const cleanParent = NotionService.formatUUID(parentPageId);
    const data = await this.notionFetch('/pages', 'POST', {
      parent: { type: 'page_id', page_id: cleanParent },
      properties: {
        title: { title: [{ text: { content: title } }] },
      },
    });
    return { id: data.id, title };
  }

  // Exchange OAuth authorization code for access token
  static async exchangeOAuthCode(code: string, redirectUri: string): Promise<{
    access_token: string;
    workspace_name: string;
    workspace_icon: string | null;
    owner: { type: string; user: { id: string; name: string; avatar_url: string | null } };
    error?: string;
  }> {
    const response = await fetch(OAUTH_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri }),
    });
    return response.json();
  }

  // Build the Notion OAuth authorization URL
  static getOAuthUrl(clientId: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      owner: 'user',
      state,
    });
    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  }

  async getBlockChildren(blockId: string, forceRefresh = false): Promise<NotionBlock[]> {
    const cleanId = NotionService.formatUUID(blockId);

    if (!forceRefresh) {
      const cached = this.cache.get(cleanId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }
    } else {
      this.cache.delete(cleanId);
    }

    let allResults: NotionBlock[] = [];
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      let endpoint = `/blocks/${cleanId}/children?page_size=100`;
      if (startCursor) endpoint += `&start_cursor=${startCursor}`;
      const data = await this.notionFetch(endpoint, 'GET');
      allResults = [...allResults, ...data.results];
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }

    this.cache.set(cleanId, { data: allResults, timestamp: Date.now() });
    return allResults;
  }

  // Extraer contraseña del primer bloque quote
  extractPassword(blocks: NotionBlock[]): string | null {
    for (const block of blocks) {
      if (block.type === 'quote') {
        const text = (block as any).quote?.rich_text?.map((t: any) => t.plain_text).join('') || '';
        if (text.trim()) return text.trim();
      }
    }
    return null;
  }

  // Obtener solo la contraseña (primer quote) sin cargar todo el árbol
  async fetchPassword(rootPageId: string): Promise<string | null> {
    const cleanId = NotionService.formatUUID(rootPageId);
    const endpoint = `/blocks/${cleanId}/children?page_size=100`;
    const data = await this.notionFetch(endpoint, 'GET');
    const blocks: NotionBlock[] = data.results || [];
    return this.extractPassword(blocks);
  }

  // Crear contraseña (quote block) como primer hijo de la página raíz
  async createPassword(rootPageId: string, password: string): Promise<void> {
    const cleanId = NotionService.formatUUID(rootPageId);
    await this.notionFetch(`/blocks/${cleanId}/children`, 'PATCH', {
      children: [{
        object: 'block',
        type: 'quote',
        quote: { rich_text: [{ text: { content: password } }] },
      }],
    });
  }

  // Construir cadena de ancestros desde un bloque hasta ROOT_PAGE_ID
  async getAncestorPath(blockId: string, rootId: string): Promise<string[]> {
    const path: string[] = [];
    let currentId = NotionService.formatUUID(blockId);
    const cleanRoot = NotionService.formatUUID(rootId);
    const maxDepth = 20; // safety limit
    for (let i = 0; i < maxDepth; i++) {
      try {
        const block = await this.notionFetch(`/blocks/${currentId}`, 'GET');
        const parentId = block.parent?.block_id || block.parent?.page_id || '';
        if (!parentId) break;
        const cleanParent = NotionService.formatUUID(parentId);
        if (cleanParent === cleanRoot) break;
        // Store the raw parent ID (with dashes) to match tree node IDs
        path.unshift(parentId);
        currentId = cleanParent;
      } catch { break; }
    }
    return path;
  }

  // Construir árbol de archivos: toggle = carpeta, code = archivo
  extractFileTree(blocks: NotionBlock[], parentId?: string): FileTreeNode[] {
    const nodes: FileTreeNode[] = [];

    for (const block of blocks) {
      if (block.type === 'toggle') {
        const title = (block as NotionToggleBlock).toggle?.rich_text
          ?.map((t: any) => t.plain_text)
          .join('') || 'Sin nombre';
        nodes.push({
          id: block.id,
          name: title,
          type: 'folder',
          parentId,
          children: [],
          isExpanded: false,
          isLoaded: false,
        });
      } else if (block.type === 'code') {
        const caption = block.code?.caption?.map((t: any) => t.plain_text).join('') || '';
        const language = block.code?.language || 'plain text';
        const name = caption || `${language} snippet`;
        nodes.push({
          id: block.id,
          name,
          type: 'file',
          parentId,
          language,
        });
      }
    }

    // Deduplicate by block ID (Notion can return duplicates in edge cases)
    const seen = new Set<string>();
    return nodes.filter(n => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }

  async searchFilesByName(rootPageId: string, query: string, limit = 25): Promise<FileTreeSearchResult[]> {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return [];

    const results: FileTreeSearchResult[] = [];
    const seen = new Set<string>();
    const queue: Array<{ id: string; parentIds: string[]; pathLabels: string[] }> = [
      { id: rootPageId, parentIds: [], pathLabels: [] },
    ];

    while (queue.length > 0 && results.length < limit) {
      const current = queue.shift();
      if (!current) break;

      const blocks = await this.getBlockChildren(current.id);
      for (const block of blocks) {
        if (block.type === 'toggle') {
          const title = (block as NotionToggleBlock).toggle?.rich_text
            ?.map((t: any) => t.plain_text || '')
            .join('')
            .trim() || 'Sin nombre';

          queue.push({
            id: block.id,
            parentIds: [...current.parentIds, block.id],
            pathLabels: [...current.pathLabels, title],
          });
          continue;
        }

        if (block.type !== 'code') continue;

        const caption = block.code?.caption?.map((t: any) => t.plain_text || '').join('').trim() || '';
        const language = block.code?.language || 'plain text';
        const name = caption || `${language} snippet`;
        if (!name.toLocaleLowerCase().includes(search) || seen.has(block.id)) continue;

        seen.add(block.id);
        results.push({
          id: block.id,
          name,
          language,
          parentIds: current.parentIds,
          pathLabels: current.pathLabels,
        });

        if (results.length >= limit) break;
      }
    }

    return results;
  }

  // Leer contenido de un archivo (code block)
  async readFileContent(blockId: string): Promise<{ content: string; language: string; name: string }> {
    const cleanId = NotionService.formatUUID(blockId);
    const data = await this.notionFetch(`/blocks/${cleanId}`, 'GET');

    if (data.type !== 'code') {
      throw new Error('Block is not a code block');
    }

    const content = data.code?.rich_text?.map((t: any) => t.plain_text).join('') || '';
    const language = data.code?.language || 'plain text';
    const caption = data.code?.caption?.map((t: any) => t.plain_text).join('') || '';
    const name = caption || `${language} snippet`;

    return { content, language, name };
  }

  // Actualizar contenido de un code block
  async updateCodeBlock(blockId: string, content: string): Promise<void> {
    const cleanId = NotionService.formatUUID(blockId);
    const richText = this.splitContentToRichText(content);
    // Try with unarchive flag (handles archived blocks), fallback to plain update
    try {
      await this.notionFetch(`/blocks/${cleanId}`, 'PATCH', {
        archived: false,
        code: { rich_text: richText },
      });
    } catch {
      await this.notionFetch(`/blocks/${cleanId}`, 'PATCH', {
        code: { rich_text: richText },
      });
    }
    this.invalidateBlock(blockId);
  }

  // Actualizar language de un code block
  async updateCodeBlockLanguage(blockId: string, language: string): Promise<void> {
    const cleanId = NotionService.formatUUID(blockId);
    // Try to unarchive first (no-op if not archived), then update
    try {
      await this.notionFetch(`/blocks/${cleanId}`, 'PATCH', {
        archived: false,
        code: { language },
      });
    } catch {
      // Fallback: try without archived flag
      await this.notionFetch(`/blocks/${cleanId}`, 'PATCH', {
        code: { language },
      });
    }
    this.invalidateBlock(blockId);
  }

  // Notion limita rich_text a 2000 chars por elemento y máx 100 elementos
  private splitContentToRichText(content: string): { text: { content: string } }[] {
    const MAX_LENGTH = 2000;
    const MAX_ELEMENTS = 100;
    const parts: { text: { content: string } }[] = [];
    // Cap content at MAX_ELEMENTS * MAX_LENGTH = 200,000 chars
    const cappedContent = content.slice(0, MAX_LENGTH * MAX_ELEMENTS);
    for (let i = 0; i < cappedContent.length; i += MAX_LENGTH) {
      parts.push({ text: { content: cappedContent.slice(i, i + MAX_LENGTH) } });
    }
    if (parts.length === 0) {
      parts.push({ text: { content: '' } });
    }
    if (content.length > MAX_LENGTH * MAX_ELEMENTS) {
      console.warn(`Content truncated: ${content.length} chars exceeds Notion limit of ${MAX_LENGTH * MAX_ELEMENTS}`);
    }
    return parts;
  }

  // Crear nueva carpeta (toggle block)
  async createFolder(parentId: string, title: string): Promise<FileTreeNode> {
    const cleanId = NotionService.formatUUID(parentId);
    const body = {
      children: [{
        object: 'block',
        type: 'toggle',
        toggle: { rich_text: [{ text: { content: title } }] },
      }],
    };
    const data = await this.notionFetch(`/blocks/${cleanId}/children`, 'PATCH', body);
    this.invalidateBlock(parentId);
    return {
      id: data.results[0].id,
      name: title,
      type: 'folder',
      parentId,
      children: [],
      isExpanded: false,
      isLoaded: true,
    };
  }

  // Crear nuevo archivo (code block) dentro de un toggle
  async createFile(parentId: string, name: string, language: string = 'plain text'): Promise<FileTreeNode> {
    const cleanId = NotionService.formatUUID(parentId);
    const body = {
      children: [{
        object: 'block',
        type: 'code',
        code: {
          rich_text: [{ text: { content: '' } }],
          language,
          caption: [{ text: { content: name } }],
        },
      }],
    };
    const data = await this.notionFetch(`/blocks/${cleanId}/children`, 'PATCH', body);
    this.invalidateBlock(parentId);
    return {
      id: data.results[0].id,
      name,
      type: 'file',
      parentId,
      language,
    };
  }

  // Eliminar un bloque
  async deleteBlock(blockId: string): Promise<void> {
    const cleanId = NotionService.formatUUID(blockId);
    await this.notionFetch(`/blocks/${cleanId}`, 'DELETE');
    this.invalidateBlock(blockId);
  }

  // Renombrar archivo (actualizar caption del code block)
  async renameFile(blockId: string, newName: string): Promise<void> {
    const cleanId = NotionService.formatUUID(blockId);
    const body = {
      code: {
        caption: [{ text: { content: newName } }],
      },
    };
    await this.notionFetch(`/blocks/${cleanId}`, 'PATCH', body);
    this.invalidateBlock(blockId);
  }

  // Renombrar carpeta (actualizar rich_text del toggle)
  async renameFolder(blockId: string, newName: string): Promise<void> {
    const cleanId = NotionService.formatUUID(blockId);
    const body = {
      toggle: {
        rich_text: [{ text: { content: newName } }],
      },
    };
    await this.notionFetch(`/blocks/${cleanId}`, 'PATCH', body);
    this.invalidateBlock(blockId);
  }

  // Limpiar rich_text para envío (quitar campos de solo lectura)
  private cleanRichText(richText: any[]): any[] {
    if (!richText || richText.length === 0) return [{ text: { content: '' } }];
    return richText.map((rt: any) => {
      const clean: any = {};
      if (rt.text) clean.text = { content: rt.text.content || '', link: rt.text.link || null };
      if (rt.type === 'equation' && rt.equation) clean.equation = { expression: rt.equation.expression };
      if (!clean.text && !clean.equation) clean.text = { content: rt.plain_text || '' };
      return clean;
    });
  }

  // Mover bloque a otro padre (recrear en destino + eliminar original)
  async moveBlock(blockId: string, newParentId: string, afterBlockId?: string): Promise<string> {
    const cleanId = NotionService.formatUUID(blockId);
    const cleanParent = NotionService.formatUUID(newParentId);

    // Leer bloque original
    const block = await this.notionFetch(`/blocks/${cleanId}`, 'GET');

    let newBlock: any;
    if (block.type === 'code') {
      // Juntar todo el contenido y re-split en chunks de 2000
      const fullContent = (block.code?.rich_text || []).map((t: any) => t.plain_text || t.text?.content || '').join('');
      const language = block.code?.language || 'plain text';
      const captionText = (block.code?.caption || []).map((t: any) => t.plain_text || t.text?.content || '').join('');
      newBlock = {
        object: 'block',
        type: 'code',
        code: {
          rich_text: this.splitContentToRichText(fullContent),
          language,
          caption: [{ text: { content: captionText } }],
        },
      };
    } else if (block.type === 'toggle') {
      const richText = this.cleanRichText(block.toggle?.rich_text);
      newBlock = {
        object: 'block',
        type: 'toggle',
        toggle: { rich_text: richText },
      };
    } else {
      throw new Error(`Cannot move block of type: ${block.type}`);
    }

    // Crear en nuevo padre (con posición opcional)
    const appendBody: any = { children: [newBlock] };
    if (afterBlockId) appendBody.after = NotionService.formatUUID(afterBlockId);
    const result = await this.notionFetch(`/blocks/${cleanParent}/children`, 'PATCH', appendBody);
    const newId = result.results[0].id;

    // Si es toggle (carpeta), mover hijos recursivamente
    if (block.type === 'toggle' && block.has_children) {
      const children = await this.getBlockChildren(blockId, true);
      for (const child of children) {
        await this.moveBlock(child.id, newId);
      }
    }

    // Eliminar bloque original
    await this.deleteBlock(blockId);
    // Invalidate both old parent and new parent caches
    this.cache.clear();

    return newId;
  }

  // Duplicar bloque en el mismo padre
  async duplicateBlock(blockId: string, parentId: string): Promise<{ newId: string; name: string }> {
    const cleanId = NotionService.formatUUID(blockId);
    const cleanParent = NotionService.formatUUID(parentId);

    const block = await this.notionFetch(`/blocks/${cleanId}`, 'GET');

    let newBlock: any;
    let name = '';
    if (block.type === 'code') {
      const fullContent = (block.code?.rich_text || []).map((t: any) => t.plain_text || t.text?.content || '').join('');
      const language = block.code?.language || 'plain text';
      const captionText = (block.code?.caption || []).map((t: any) => t.plain_text || t.text?.content || '').join('');
      name = captionText ? `${captionText} (copia)` : `${language} snippet (copia)`;
      newBlock = {
        object: 'block',
        type: 'code',
        code: {
          rich_text: this.splitContentToRichText(fullContent),
          language,
          caption: [{ text: { content: name } }],
        },
      };
    } else if (block.type === 'toggle') {
      const titleText = (block.toggle?.rich_text || []).map((t: any) => t.plain_text || t.text?.content || '').join('');
      name = `${titleText} (copia)`;
      newBlock = {
        object: 'block',
        type: 'toggle',
        toggle: { rich_text: [{ text: { content: name } }] },
      };
    } else {
      throw new Error(`Cannot duplicate block of type: ${block.type}`);
    }

    const result = await this.notionFetch(`/blocks/${cleanParent}/children`, 'PATCH', {
      children: [newBlock],
    });
    const newId = result.results[0].id;

    // Si es toggle, duplicar hijos recursivamente
    if (block.type === 'toggle' && block.has_children) {
      const children = await this.getBlockChildren(blockId, true);
      for (const child of children) {
        await this.duplicateBlock(child.id, newId);
      }
    }

    this.invalidateBlock(parentId);
    return { newId, name };
  }

  // ── Alarm sync (cross-device via Notion) ─────────────────────────────
  private readonly ALARMS_PAGE_TITLE = 'wzg-alarms-config';

  /** Finds or creates a hidden child page inside rootPageId used to store alarms as JSON. */
  async findOrCreateAlarmsPage(rootPageId: string): Promise<string> {
    const cleanRoot = NotionService.formatUUID(rootPageId);
    const cacheKey = `wzg-notion-alarms-page:${cleanRoot}`;
    const cached = IS_BROWSER ? localStorage.getItem(cacheKey) : null;
    if (cached) return cached;

    // Scan root page children for existing alarms page
    let hasMore = true;
    let startCursor: string | undefined;
    while (hasMore) {
      let ep = `/blocks/${cleanRoot}/children?page_size=100`;
      if (startCursor) ep += `&start_cursor=${startCursor}`;
      const data = await this.notionFetch(ep, 'GET');
      for (const block of (data.results || [])) {
        if (block.type === 'child_page' && block.child_page?.title === this.ALARMS_PAGE_TITLE) {
          if (IS_BROWSER) localStorage.setItem(cacheKey, block.id);
          return block.id;
        }
      }
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }

    // Not found — create it
    const newPage = await this.notionFetch('/pages', 'POST', {
      parent: { type: 'page_id', page_id: cleanRoot },
      properties: {
        title: { title: [{ text: { content: this.ALARMS_PAGE_TITLE } }] },
      },
    });
    if (IS_BROWSER) localStorage.setItem(cacheKey, newPage.id);
    return newPage.id;
  }

  /** Reads the alarms JSON stored in the alarms config page. Returns { alarms, lastModified }. */
  async readAlarms(rootPageId: string): Promise<{ alarms: any[]; lastModified: number }> {
    const pageId = await this.findOrCreateAlarmsPage(rootPageId);
    const cleanId = NotionService.formatUUID(pageId);
    const data = await this.notionFetch(`/blocks/${cleanId}/children?page_size=10`, 'GET');
    for (const block of (data.results || [])) {
      if (block.type === 'code') {
        const content = (block.code?.rich_text || [])
          .map((t: any) => t.plain_text || t.text?.content || '')
          .join('');
        try {
          const parsed = JSON.parse(content);
          // New format: { alarms, lastModified }
          if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.alarms)) {
            return { alarms: parsed.alarms, lastModified: parsed.lastModified ?? 0 };
          }
          // Old format: plain array
          if (Array.isArray(parsed)) {
            return { alarms: parsed, lastModified: 0 };
          }
        } catch { /* ignore */ }
      }
    }
    return { alarms: [], lastModified: 0 };
  }

  // ── Database operations ──────────────────────────────────────────────

  /** Create a Notion database under a parent block. Returns the new database id. */
  async createDatabase(parentBlockId: string, title: string, properties: object): Promise<{ id: string }> {
    const cleanParent = NotionService.formatUUID(parentBlockId);
    const data = await this.notionFetch('/databases', 'POST', {
      parent: { type: 'block_id', block_id: cleanParent },
      title: [{ type: 'text', text: { content: title } }],
      properties,
    });
    this.invalidateBlock(parentBlockId);
    return { id: data.id };
  }

  /** Create a Notion database under a parent PAGE. Returns the new database id.
   *  Notion API requires parent type 'page_id' for inline databases. */
  async createDatabaseUnderPage(parentPageId: string, title: string, properties: object): Promise<{ id: string }> {
    const cleanParent = NotionService.formatUUID(parentPageId);
    const data = await this.notionFetch('/databases', 'POST', {
      parent: { type: 'page_id', page_id: cleanParent },
      title: [{ type: 'text', text: { content: title } }],
      properties,
    });
    this.invalidateBlock(parentPageId);
    return { id: data.id };
  }

  /**
   * Retrieve the current properties schema of a database.
   * Returns the raw properties object from Notion.
   */
  async getDatabaseProperties(databaseId: string): Promise<Record<string, any>> {
    const cleanId = NotionService.formatUUID(databaseId);
    const data = await this.notionFetch(`/databases/${cleanId}`, 'GET');
    return data.properties ?? {};
  }

  /**
   * Add missing properties to an existing database (schema migration).
   * Only adds properties that don't already exist — never removes or modifies
   * existing ones, so user data is preserved.
   */
  async migrateDatabase(databaseId: string, requiredProperties: Record<string, any>): Promise<void> {
    const existing = await this.getDatabaseProperties(databaseId);
    const missing: Record<string, any> = {};

    for (const [name, schema] of Object.entries(requiredProperties)) {
      if (!existing[name]) {
        missing[name] = schema;
      }
    }

    // Nothing to migrate.
    if (Object.keys(missing).length === 0) return;

    const cleanId = NotionService.formatUUID(databaseId);
    await this.notionFetch(`/databases/${cleanId}`, 'PATCH', {
      properties: missing,
    });
  }

  /** Create a page (row) inside a database. Returns the new page id. */
  async createDatabaseRow(databaseId: string, properties: object): Promise<{ id: string }> {
    const cleanId = NotionService.formatUUID(databaseId);
    const data = await this.notionFetch('/pages', 'POST', {
      parent: { database_id: cleanId },
      properties,
    });
    return { id: data.id };
  }

  /** Query a database with optional filter/sort. Returns a single page of results. */
  async queryDatabase(
    databaseId: string,
    body: object,
    startCursor?: string,
  ): Promise<{ results: any[]; has_more: boolean; next_cursor: string | null }> {
    const cleanId = NotionService.formatUUID(databaseId);
    const requestBody: any = { ...body };
    if (startCursor) requestBody.start_cursor = startCursor;
    const data = await this.notionFetch(`/databases/${cleanId}/query`, 'POST', requestBody);
    return {
      results: data.results || [],
      has_more: Boolean(data.has_more),
      next_cursor: data.next_cursor ?? null,
    };
  }

  /** Query every page of a database, looping on has_more/next_cursor and aggregating all results. */
  async queryDatabaseAll(databaseId: string, body: object): Promise<any[]> {
    let allResults: any[] = [];
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      const page = await this.queryDatabase(databaseId, body, startCursor);
      allResults = [...allResults, ...page.results];
      hasMore = page.has_more;
      startCursor = page.next_cursor ?? undefined;
    }

    return allResults;
  }

  /** Writes the alarms array as JSON into the alarms config page. Returns the lastModified timestamp used. */
  async writeAlarms(rootPageId: string, alarms: any[]): Promise<number> {
    const lastModified = Date.now();
    const pageId = await this.findOrCreateAlarmsPage(rootPageId);
    const cleanId = NotionService.formatUUID(pageId);
    const richText = this.splitContentToRichText(JSON.stringify({ alarms, lastModified }));

    const data = await this.notionFetch(`/blocks/${cleanId}/children?page_size=10`, 'GET');
    const codeBlock = (data.results || []).find((b: any) => b.type === 'code');

    if (codeBlock) {
      await this.notionFetch(`/blocks/${codeBlock.id}`, 'PATCH', {
        code: { rich_text: richText, language: 'json' },
      });
    } else {
      await this.notionFetch(`/blocks/${cleanId}/children`, 'PATCH', {
        children: [{ object: 'block', type: 'code', code: { rich_text: richText, language: 'json' } }],
      });
    }
    return lastModified;
  }
}
