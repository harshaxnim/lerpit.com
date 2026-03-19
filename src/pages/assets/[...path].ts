import { promises as fsp } from 'node:fs';
import { getLerpetteAssetEntries } from '../../lib/lerpettes/content';

export async function getStaticPaths() {
  const assets = await getLerpetteAssetEntries();
  return assets.map((asset) => ({
    params: {
      path: asset.urlPath.replace(/^\/assets\//, '')
    },
    props: asset
  }));
}

export async function GET({ props }: { props: { filePath: string; contentType: string } }) {
  const data = await fsp.readFile(props.filePath);
  return new Response(data, {
    headers: {
      'Content-Type': props.contentType
    }
  });
}
