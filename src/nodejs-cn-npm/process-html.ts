import {
  DownloadResource,
  ProcessResourceAfterDownloadFunc,
  SubmitResourceFunc
} from 'website-scrap-engine/lib/life-cycle/types';
import {StaticDownloadOptions} from 'website-scrap-engine/lib/options';
import {ResourceType} from 'website-scrap-engine/lib/resource';
import {parseHtml} from 'website-scrap-engine/lib/life-cycle/adapters';
import {Cheerio, CheerioStatic} from 'website-scrap-engine/lib/types';
import {NpmPageScriptData, parseScriptContent} from './parse-script';
import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';

const decryptKey = '0aa20b25-fb94-4900-9a35-be2c8f378703';

function parseScriptData($: CheerioStatic): {
  scriptData: NpmPageScriptData | void,
  scripts: Cheerio
} {
  let scriptData: NpmPageScriptData | void;
  const scripts = $('script');
  for (let i = 0; i < scripts.length; i++) {
    const el = $(scripts[i]);
    const src = el.attr('src');
    if (src) {
      continue;
    }
    const html = el.html();
    if (html) {
      scriptData = parseScriptContent(html);
      if (scriptData) {
        break;
      }
    }
  }
  return {scriptData, scripts};
}

function fixHeadings($: CheerioStatic) {
  const headings = $('#content')
    .find('h1,h2,h3,h4,h5,h6');
  for (let i = 0; i < headings.length; i++) {
    const el = $(headings[i]);
    const id = el.attr('id');
    const cn = el.attr('cn');
    let html = el.html();
    if (!html) {
      html = '';
    }
    if (el.is('h1')) {
      html = `<a class="heading-anchor" href="#${id}">
<svg class="octicon-link" role="img" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display:inline-block;user-select:none;vertical-align:middle;overflow:visible">
<path fill-rule="evenodd" d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z"></path></svg></a>
${html}`;
    }
    if (cn !== undefined) {
      html += `<a class="heading-item-entry" href="~/${id ? id.replace(/~/g, '/') + '/' : ''}">中英</a>`;
    }
    el.html(html);
  }
}

function decryptContents(scriptData: NpmPageScriptData | void, $: CheerioStatic) {
  if (scriptData?.itemId && scriptData?.itemName) {
    const encrypted = $('.cr');
    const iv = String(scriptData.itemId.length + scriptData.itemName.length);
    for (let i = 0; i < encrypted.length; i++) {
      const el = $(encrypted[i]);
      const html = el.html();
      if (!html) {
        continue;
      }
      const decrypted = AES.decrypt(html, Utf8.parse(decryptKey), {
        iv: Utf8.parse(iv),
      }).toString(Utf8);
      el.html(decrypted);
      el.removeClass('cr');
    }
  }
}

function decryptLinks(scriptData: NpmPageScriptData | void, $: CheerioStatic) {
  if (scriptData?.link) {
    const a = $('a[href]');
    for (let i = 0; i < a.length; i++) {
      const el = $(a[i]);
      const href = el.attr('href');
      if (href && href.startsWith('##') && href.length > 2) {
        const decrypted = scriptData.link[href.slice(2)];
        if (decrypted) {
          el.attr('href', decrypted);
        }
      }
    }
  }
}

function fixImages($: CheerioStatic) {
  const images = $('img[data-src]');
  for (let i = 0; i < images.length; i++) {
    const img = $(images[i]);
    const dataSrc = img.attr('data-src');
    const src = img.attr('src');
    if (!src && dataSrc) {
      img.attr('src', dataSrc);
    }
  }
}

export const preProcessHtml: ProcessResourceAfterDownloadFunc = async (
  res: DownloadResource,
  submit: SubmitResourceFunc,
  options: StaticDownloadOptions
): Promise<DownloadResource> => {
  if (res.type !== ResourceType.Html) {
    return res;
  }
  if (!res.meta.doc) {
    res.meta.doc = parseHtml(res, options);
  }
  const $ = res.meta.doc;

  // parse data from inline scripts
  const {scriptData, scripts} = parseScriptData($);

  // fix headings
  fixHeadings($);

  // decrypt contents
  decryptContents(scriptData, $);

  // decrypt links
  decryptLinks(scriptData, $);

  // fix img src with data-src
  fixImages($);

  const body = $('body');

  // remove comments in body
  body.contents().filter(function (this) {
    return this.nodeType === 8;
  }).remove();

  $('#biz_nav').remove();
  $('#biz_content').remove();
  $('#biz_item').remove();
  $('#wxcode_box').remove();

  // remove all scripts
  scripts.remove();

  return res;
};
