import assert from 'node:assert/strict';
import test from 'node:test';
import { createWhiteboardShortcuts } from '../src/lib/classroom/whiteboard/shortcuts';
import { normalizeScreenShareOptions, portraitGeometry } from '../src/lib/classroom/share-portrait';
import type { ClassroomWhiteboardController, ClassroomWhiteboardTool } from '../src/components/classroom/fastboard-surface';

function fixture(nativeHistory = false, allowPan = true) {
  let tool: ClassroomWhiteboardTool = 'pencil';
  const calls: string[] = [];
  const controller = { setTool: (next: string) => calls.push(next), undo: () => calls.push('undo'), redo: () => calls.push('redo'), deleteSelection: () => calls.push('delete') } as unknown as ClassroomWhiteboardController;
  const handlers = createWhiteboardShortcuts({ controller, getTool: () => tool, selectTool: next => { tool = next; }, nativeHistory, allowPan });
  const key = (key: string, extra = {}) => ({ key, code: key === ' ' ? 'Space' : key, preventDefault() {}, stopPropagation() {}, ...extra }) as KeyboardEvent;
  const pointer = (shiftKey = false) => ({ button: 0, shiftKey, target: { closest: (selector: string) => selector.includes('board-canvas') } }) as unknown as PointerEvent;
  return { handlers, calls, key, pointer, tool: () => tool };
}

test('Shift draws a temporary straight gesture and safely restores pencil after release/blur', async () => {
  const f = fixture();
  f.handlers.keydown(f.key('Shift')); assert.equal(f.tool(), 'straight');
  f.handlers.pointerdown(f.pointer(true)); f.handlers.keyup(f.key('Shift'));
  assert.equal(f.tool(), 'straight', 'do not change appliance in the middle of a stroke');
  f.handlers.pointerup(); assert.equal(f.tool(), 'straight', 'SDK must receive pointerup before appliance changes');
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.tool(), 'pencil');
  f.handlers.pointerdown(f.pointer(true)); assert.equal(f.tool(), 'straight', 'held modifier entering the canvas');
  f.handlers.blur(); assert.equal(f.tool(), 'pencil');
  f.handlers.keydown(f.key('Shift')); f.handlers.keydown(f.key('a')); f.handlers.keyup(f.key('Shift'));
  assert.equal(f.tool(), 'arrow', 'explicit tool choice overrides temporary tool');
});

test('drawing shortcuts leave inputs, composition and SDK native history alone', () => {
  const f = fixture(true);
  f.handlers.keydown(f.key('e', { target: { closest: () => true } }));
  f.handlers.keydown(f.key('l', { isComposing: true }));
  f.handlers.keydown(f.key('z', { metaKey: true }));
  assert.deepEqual(f.calls, []);
  f.handlers.keydown(f.key(' ')); assert.equal(f.tool(), 'clicker');
  f.handlers.keyup(f.key(' ')); assert.equal(f.tool(), 'pencil');
  f.handlers.keydown(f.key('r')); assert.equal(f.tool(), 'rectangle');
});

test('fixed screen annotations expose history/delete but never pan the video overlay', () => {
  const f = fixture(false, false);
  f.handlers.keydown(f.key('h')); f.handlers.keydown(f.key(' ')); assert.deepEqual(f.calls, []);
  f.handlers.keydown(f.key('z', { ctrlKey: true }));
  f.handlers.keydown(f.key('z', { metaKey: true, shiftKey: true }));
  f.handlers.keydown(f.key('y', { ctrlKey: true }));
  f.handlers.keydown(f.key('Delete'));
  assert.deepEqual(f.calls, ['undo', 'redo', 'redo', 'delete']);
});

test('portrait geometry clamps the entire circular frame and validates untrusted option values', () => {
  assert.equal(normalizeScreenShareOptions({ mode: 'portrait', portraitSize: 999 }).portraitSize, 240);
  assert.equal(normalizeScreenShareOptions({ mode: 'portrait', portraitSize: -1 }).portraitSize, 120);
  assert.equal(normalizeScreenShareOptions({ mode: 'portrait', portraitSize: NaN }).portraitSize, 240);
  assert.equal(normalizeScreenShareOptions({ mode: 'portrait', portraitBorderColor: 'toString' as 'white' }).portraitBorderColor, 'white');
  assert.deepEqual(portraitGeometry(1920, 1080, { mode: 'portrait', corner: 'br', portraitSize: 120 }), { x: 1760, y: 920, diameter: 120 });
  assert.deepEqual(portraitGeometry(1920, 1080, { mode: 'portrait', corner: 'tl' }), { x: 40, y: 40, diameter: 240 });
});
