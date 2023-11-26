import type {
  DownloadResource,
  ProcessResourceAfterDownloadFunc,
  SubmitResourceFunc
} from 'website-scrap-engine/lib/life-cycle/types';
import type {StaticDownloadOptions} from 'website-scrap-engine/lib/options';
import {ResourceType} from 'website-scrap-engine/lib/resource';
import {parseHtml} from 'website-scrap-engine/lib/life-cycle/adapters';
import type {CheerioStatic} from 'website-scrap-engine/lib/types';
import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';
import {keys} from './keys';

function fixHeadings($: CheerioStatic) {
  // TODO: this might be useless now
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

/*
// original decrypt code
_np:
const _c=CryptoJS; _hr=location.href; _cu=_c.enc.Utf8; _cp=_cu.parse; _cd=_c.AES.decrypt;
_nh:
_t=_ele; _t2=_t.getAttribute('data-href');
_nd:
(()=>{if(!_hr.includes('nodejs.cn'))return; _t.setAttribute('href',
_cd(_t2,_cp('0ast0t25-fb94-4900-9a35-be2c8f37bec4'), {iv:_cp(_ni.length*123), }).toString(_cu)); })()
 */
function decryptLinks($: CheerioStatic, host: string) {

  const encryptKey = keys[host];
  if (!encryptKey) {
    return;
  }
  const dom = $('body');
  if (!dom.length) return;

  const niDom = dom.find('[data-ni]');
  if (!niDom) return;
  const _ni = niDom.attr('data-ni');
  if (!_ni) return;
  dom.find('[data-href]').each((_, el) => {
    const elem = $(el);
    const encryptedHref = elem.attr('data-href');
    if (!encryptedHref) return;
    elem.attr('href',
      AES.decrypt(encryptedHref, Utf8.parse(encryptKey), {
        iv: Utf8.parse(String(_ni.length * 123)),
      }).toString(Utf8));
    elem.removeAttr('data-href');
  });
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

  // fix headings
  fixHeadings($);

  // decrypt links
  decryptLinks($, res.uri?.host() || '');

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
  $('.wwads-cn').remove();
  $('.footer-links').remove();
  $('#pagead').remove();
  $('script[src^="https://cdn.wwads.cn/"]').remove();

  return res;
};
