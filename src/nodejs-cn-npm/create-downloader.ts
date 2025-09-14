import path from 'path';
import {SingleThreadDownloader} from 'website-scrap-engine/lib/downloader/single.js';
import type {StaticDownloadOptions} from 'website-scrap-engine/lib/options.js';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function createDownloader(
  overrideOptions: Partial<StaticDownloadOptions>
): Promise<SingleThreadDownloader> {
  const downloader: SingleThreadDownloader =
    new SingleThreadDownloader(
      'file://' + path.join(__dirname, 'life-cycle.js'), overrideOptions);
  return downloader.init.then(() => downloader);
}
