import {parse} from 'json5';
import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';
import {error as errorLogger} from 'website-scrap-engine/lib/logger/logger';

const PAGE_ID = /,?window\.PAGE_ID\s*=\s*['"]([^'"]+)['"],?/;
const DOC_ID = /,?window\.DOC_ID\s*=\s*['"]([^'"]+)['"],?/;
const ITEM_ID = /,?window\.ITEM_ID\s*=\s*['"]([^'"]+)['"],?/;
const ITEM_NAME = /,?window\.ITEM_NAME\s*=\s*['"]([^'"]+)['"],?/;
const HEADING_SELECTOR = /,?window\.HEADING_SELECTOR\s*=\s*['"]([^'"]+)['"],?/;
const LINK = /,?window\.LINK\s*=\s*(\{[^}]+}),?/;

export interface NpmPageScriptData {
  pageId?: string;
  docId?: string;
  itemId?: string;
  itemName?: string;
  headingSelector?: string;
  link?: Record<string, string>;
}

function matchFirst(content: string, regExp: RegExp): string | undefined {
  const result = regExp.exec(content);
  if (result?.[1]?.length) {
    return result[1];
  }
}

const decryptKey = '0aa20b25-fb94-4900-9a35-be2c8f37bec4';

function decryptLink(link: string, data: NpmPageScriptData): string {
  if (!data.itemName || !data.itemId) {
    errorLogger.error('link decrypt fail, not enough info', link, data);
    return link;
  }
  return AES.decrypt(link, Utf8.parse(decryptKey), {
    iv: Utf8.parse(String(data.itemId.length + data.itemName.length)),
  }).toString(Utf8);
}

export function parseScriptContent(content: string): NpmPageScriptData | void {
  const data: NpmPageScriptData = {};
  data.pageId = matchFirst(content, PAGE_ID);
  data.docId = matchFirst(content, DOC_ID);
  data.itemId = matchFirst(content, ITEM_ID);
  data.itemName = matchFirst(content, ITEM_NAME);
  data.headingSelector = matchFirst(content, HEADING_SELECTOR);
  const link = matchFirst(content, LINK);
  if (link) {
    data.link = parse(link);
    for (const linkKey in data.link) {
      data.link[linkKey] = decryptLink(data.link[linkKey], data);
    }
  }
  if (data.pageId || data.docId || data.itemId || data.itemName || data.link) {
    return data;
  }
}
