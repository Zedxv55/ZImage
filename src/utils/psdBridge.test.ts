import test from 'node:test';
import assert from 'node:assert/strict';
import { readPsd, writePsdBuffer } from 'ag-psd';
import {
  buildPsdLayerMetadata,
  mapPsdBlendToStudio,
  mapStudioBlendToPsd,
} from './psdBridge';
import type { TextStudioLayer } from './studioTypes';

test('blend mode mappings between ZImage Studio and PSD are lossless for supported modes', () => {
  assert.equal(mapStudioBlendToPsd('source-over'), 'normal');
  assert.equal(mapStudioBlendToPsd('multiply'), 'multiply');
  assert.equal(mapStudioBlendToPsd('screen'), 'screen');
  assert.equal(mapStudioBlendToPsd('overlay'), 'overlay');

  assert.equal(mapPsdBlendToStudio('normal'), 'source-over');
  assert.equal(mapPsdBlendToStudio('multiply'), 'multiply');
  assert.equal(mapPsdBlendToStudio('screen'), 'screen');
  assert.equal(mapPsdBlendToStudio('overlay'), 'overlay');
});

test('buildPsdLayerMetadata converts center coordinates + scale to PSD bounding box & text metadata', () => {
  const layer: TextStudioLayer = {
    id: 't1',
    name: 'Hero Title',
    type: 'text',
    provenance: 'text',
    visible: true,
    locked: false,
    x: 540,
    y: 200,
    width: 400,
    height: 100,
    scale: 1.5,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 80,
    blendMode: 'multiply',
    parallaxDepth: 0,
    keyframes: [],
    text: 'ZImage Studio',
    fontFamily: 'Kanit',
    fontSize: 48,
    color: '#2563EB',
    bold: true,
    align: 'center',
    shadow: false,
    strokeWidth: 0,
    strokeColor: '#FFFFFF',
  };

  const meta = buildPsdLayerMetadata(layer, 1080, 1080);
  assert.equal(meta.left, 240);
  assert.equal(meta.top, 125);
  assert.equal(meta.right, 840);
  assert.equal(meta.bottom, 275);
  assert.equal(meta.opacity, 0.8);
  assert.equal(meta.hidden, false);
  assert.equal(meta.blendMode, 'multiply');
  assert.equal(meta.textContent, 'ZImage Studio');
  assert.equal(meta.fontSize, 72);
});

test('ag-psd roundtrips a multi-layer PSD buffer in Node without browser DOM', () => {
  const buf = writePsdBuffer({
    width: 64,
    height: 64,
    channels: 4,
    bitsPerChannel: 8,
    children: [
      {
        name: 'Background [raster]',
        left: 0,
        top: 0,
        right: 64,
        bottom: 64,
        opacity: 1,
      },
      {
        name: 'Title [text]',
        left: 10,
        top: 10,
        right: 54,
        bottom: 30,
        opacity: 0.75,
        blendMode: 'screen',
      },
    ],
  });
  assert.ok(buf.byteLength > 100);
  const parsed = readPsd(buf, { skipLayerImageData: true, skipCompositeImageData: true });
  assert.equal(parsed.width, 64);
  assert.equal(parsed.height, 64);
  assert.equal(parsed.children?.length, 2);
  assert.equal(parsed.children?.[1].name, 'Title [text]');
  assert.equal(parsed.children?.[1].blendMode, 'screen');
});
