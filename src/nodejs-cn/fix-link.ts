import got from 'got';
import type {StaticDownloadOptions} from 'website-scrap-engine/lib/options';
import {error as errorLogger} from 'website-scrap-engine/lib/logger/logger';
import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';

const KW_ARR_BEGIN = 'var arr = [',
  KW_ARR_END = '];',
  KW_ARR_INDEX_BEGIN = 'location.replace(arr[';

const HOST = 'nodejs.cn',
  PROTOCOL = 'http',
  URL_PREFIX = `${PROTOCOL}://${HOST}`;

const LOCATION_REPLACE_LITERAL = 'location.replace(\'',
  LOCATION_REPLACE_LITERAL_END = '\')';

const WINDOW_LINK_START = 'window.LINK = \'',
  WINDOW_LINK_END = '\';';
const WINDOW_LINK_DECRYPT_KEY = '70ffab5e-7998-41c5-b94c-6ad639b905ab';

const gotNoRedirect = got.extend({
  followRedirect: false
});

export const cache: Record<string, string> = {};
const asyncRedirectCache: Record<string, Promise<string>> = {};

const getRedirectLocation = async (
  link: string,
  options: StaticDownloadOptions
): Promise<string> => {
  // make sure that followRedirect is false here
  const theGot = options?.req ? got.extend(options.req, {
    followRedirect: false
  }) : gotNoRedirect;
  const redirect = await theGot(
    link.startsWith('/s') ? URL_PREFIX + link : link);
  if (redirect.statusCode === 302 && redirect.headers?.location) {
    cache[link] = redirect.headers.location;
    link = redirect.headers.location;
  } else if (redirect.body) {
    /**
     * @type string
     */
    const html = redirect.body;
    const arrBegin = html.indexOf(KW_ARR_BEGIN),
      arrEnd = html.indexOf(KW_ARR_END, arrBegin),
      arrIndex = html.indexOf(KW_ARR_INDEX_BEGIN, arrEnd);
    if (arrBegin > 0 && arrEnd > 0 && arrIndex > 0) {
      try {
        const arr = JSON.parse(html.slice(
          arrBegin + KW_ARR_BEGIN.length - 1, arrEnd + 1));
        const i = parseInt(html.slice(
          arrIndex + KW_ARR_INDEX_BEGIN.length), 10);
        if (arr && !isNaN(i) && arr[i]) {
          cache[link] = arr[i];
          link = arr[i];
        } else {
          errorLogger.warn('Can not parse redirect for', link, arr, i);
        }
      } catch (e) {
        errorLogger.error('Error resolving redirect result', link, html, e);
      }
    } else {
      // the new redirect page since 2021
      const literalBegin = html.indexOf(LOCATION_REPLACE_LITERAL),
        literalEnd = literalBegin > 0 ?
          html.indexOf(LOCATION_REPLACE_LITERAL_END, literalBegin) : -1;
      if (literalBegin > 0 && literalEnd > 0) {
        link = html.slice(
          literalBegin + LOCATION_REPLACE_LITERAL.length, literalEnd);
      } else {
        // the new redirect page since 20220802
        const windowLinkBegin = html.indexOf(WINDOW_LINK_START),
          windowLinkEnd = windowLinkBegin > 0 ?
            html.indexOf(WINDOW_LINK_END, literalBegin) : -1;
        if (windowLinkBegin > 0 && windowLinkEnd > 0) {
          const encrypted = html.slice(
            windowLinkBegin + WINDOW_LINK_START.length, windowLinkEnd);
          try {
            link = AES.decrypt(encrypted, WINDOW_LINK_DECRYPT_KEY).toString(Utf8);
          } catch (e) {
            errorLogger.warn('Error decrypting link', link, html);
          }
        } else {
          errorLogger.warn('Unknown redirect result format', link, html);
        }
      }
    }
  }
  // replace the api to required version
  if (options?.meta?.nodeApiPath) {
    link = link.replace(`${URL_PREFIX}/api/`,
      `${URL_PREFIX}/${options.meta.nodeApiPath}/`);
  }
  return link;
};

export const cachedGetRedirectLocation = (
  link: string, options: StaticDownloadOptions
): string | Promise<string> => {
  if (cache[link]) {
    return cache[link];
  }
  if (asyncRedirectCache[link] !== undefined) {
    return asyncRedirectCache[link];
  }
  return asyncRedirectCache[link] = getRedirectLocation(link, options);
};

// the 404-not-found links
const hardCodedRedirectBuilder = (api: string): Record<string, string> => ({
  [`/${api}/stream.md`]: `/${api}/stream.html`,
  [`/${api}/http/net.html`]: `/${api}/net.html`,
  [`/${api}/fs/stream.html`]: `/${api}/stream.html`,
  [`/${api}/addons/n-api.html`]: `/${api}/n-api.html`,
  [`/${api}/assert/tty.html`]: `/${api}/tty.html`,
  [`/${api}/worker_threads/errors.html`]: `/${api}/errors.html`,
  [`/${api}/process/cli.html`]: `/${api}/cli.html`,
  [`/${api}/zlib/buffer.html`]: `/${api}/buffer.html`,
  [`/${api}/dgram/errors.html`]: `/${api}/errors.html`,
  [`/${api}/net/stream.html`]: `/${api}/stream.html`,
  [`/${api}/process/stream.html`]: `/${api}/stream.html`,
  [`/${api}/worker_threads/fs.html`]: `/${api}/fs.html`,
  // 14.12.0
  [`/${api}/synopsis/cli.html`]: `/${api}/cli.html`,
  // since 16.3.0
  [`/${api}/modules/esm.md`]: `/${api}/esm.html`,
  // since 18.4.0 maybe for api-v14 and api-v16
  [`/${api}/esm.md`]: `/${api}/esm.html`,

});

const hardCodedRedirectFullPathBuilder = (api: string): Record<string, string> => ({
  // 14.9.0
  // http://nodejs.cn/api/module.html
  [`http://${HOST}/${api}/modules_cjs.html#modules_cjs_the_module_wrapper`]:
    `http://${HOST}/${api}/modules.html#modules_the_module_wrapper`,
  // 14.9.0
  // http://nodejs.cn/api/module.html
  [`http://${HOST}/${api}/modules_module.html#modules_module_class_module_sourcemap`]:
    `http://${HOST}/${api}/module.html#module_class_module_sourcemap`,
  // 14.9.0
  // http://nodejs.cn/api/module.html
  [`http://${HOST}/${api}/modules/modules_module.html#modules_module_the_module_object`]:
    `http://${HOST}/${api}/module.html#module_the_module_object`,
  [`http://${HOST}/${api}/wiki.openssl.org/index.php/List_of_SSL_OP_Flags#Table_of_Options`]:
    'https://wiki.openssl.org/index.php/List_of_SSL_OP_Flags#Table_of_Options',
  // 16.4.0
  [`/${api}/http_new_agent_options`]:
    `http://${HOST}/${api}/http.html#http_new_agent_options`
});

export const hardCodedRedirect: Record<string, string> = {
  ...hardCodedRedirectBuilder('api'),
  ...hardCodedRedirectBuilder('api-v18'),
  ...hardCodedRedirectBuilder('api-v16'),
  ...hardCodedRedirectBuilder('api-v14'),
  ...hardCodedRedirectBuilder('api-v12'),
};

export const hardCodedRedirectFullPath: Record<string, string> = {
  ...hardCodedRedirectFullPathBuilder('api'),
  ...hardCodedRedirectFullPathBuilder('api-v18'),
  ...hardCodedRedirectFullPathBuilder('api-v16'),
  ...hardCodedRedirectFullPathBuilder('api-v14'),
  ...hardCodedRedirectFullPathBuilder('api-v12'),
};

export const initNodeApiPath = (api: string): void => {
  Object.assign(hardCodedRedirect, hardCodedRedirectBuilder(api));
  Object.assign(hardCodedRedirectFullPath, hardCodedRedirectFullPathBuilder(api));
};
