import path from 'path';
import {promises as fs} from 'fs';
import {mkdirpSync as mkdir} from 'mkdirp';
import {SingleThreadDownloader} from 'website-scrap-engine/lib/downloader/single.js';
import type {StaticDownloadOptions} from 'website-scrap-engine/lib/options.js';
import {fileURLToPath} from 'node:url';

const defaultApiPath = 'api/v24';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function createDownloader(
  overrideOptions: Partial<StaticDownloadOptions>
): Promise<SingleThreadDownloader> {
  const api = overrideOptions?.meta?.nodeApiPath as string || defaultApiPath;
  if (api !== defaultApiPath) {
    overrideOptions.initialUrl = [`https://nodejs.cn/${api}/`];
  }
  const downloader: SingleThreadDownloader =
    new SingleThreadDownloader(
      'file://' + path.join(__dirname, 'life-cycle.js'), overrideOptions);
  return downloader.init.then(() => {
    downloader.start();
    // if (overrideOptions?.meta?.replaceNodeApiPath) {
    //   api = 'api';
    // }
    const staticPath: string = path.join(downloader.options.localRoot,
      'nodejs.cn', api, 'static');
    mkdir(staticPath);
    const arr: Promise<void>[] = [
      'favicon.png',
      'inject.css',
      'inject.js'
    ].map(f => fs.copyFile(path.join(__dirname, f), path.join(staticPath, f)));
    return Promise.all(arr);
  }).then(() => downloader);
}
