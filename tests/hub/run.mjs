// Hub grid math: every tile count on four screen sizes, and the sizes the layout table names.
import assert from 'node:assert/strict';
import { hubCellPosition, hubLayout } from '../../app/hub/hubGrid.ts';

const SIZES = [
  { height: 840, name: 'phone', width: 412 },
  { height: 647, name: 'small phone', width: 375 },
  { height: 380, name: 'landscape', width: 780 },
  { height: 1200, name: 'tablet', width: 800 },
];
const EPSILON = 0.01;
const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 0.06, `${message}: ${actual} is not ${expected}`);

function checkNoOverlap(layout, cells, label) {
  const frames = Array.from({ length: cells }, (_, index) => hubCellPosition(layout, index));
  for (let first = 0; first < cells; first += 1) {
    for (let second = first + 1; second < cells; second += 1) {
      const apart =
        Math.abs(frames[first].left - frames[second].left) >= layout.tile - EPSILON ||
        Math.abs(frames[first].top - frames[second].top) >= layout.tile - EPSILON;
      assert.ok(apart, `${label}: tiles ${first} and ${second} overlap`);
    }
  }
  for (const frame of frames) {
    assert.ok(frame.left + layout.tile <= layout.grid.width + EPSILON, `${label}: tile past the grid width`);
    assert.ok(frame.top + layout.tile <= layout.grid.height + EPSILON, `${label}: tile past the grid height`);
  }
}

function checkInside(layout, { height, width }, label) {
  if (layout.scrollFrame) {
    const frame = layout.scrollFrame;
    assert.ok(frame.left >= -EPSILON && frame.left + frame.width <= width + EPSILON, `${label}: scroll frame width`);
    assert.ok(frame.top >= -EPSILON && frame.top + frame.height <= height + EPSILON, `${label}: scroll frame height`);
    assert.ok(layout.grid.left >= -EPSILON && layout.grid.left + layout.grid.width <= frame.width + EPSILON, `${label}: grid in the frame`);
    return;
  }
  const { grid } = layout;
  assert.ok(grid.left >= -EPSILON && grid.left + grid.width <= width + EPSILON, `${label}: grid inside the width`);
  assert.ok(grid.top >= -EPSILON && grid.top + grid.height <= height + EPSILON, `${label}: grid inside the height`);
}

function checkLogoClear(layout, label) {
  const logoBottom = layout.logo.top + layout.logo.size;
  if (layout.mode === 'portrait') {
    const gridTop = layout.scrollFrame ? layout.scrollFrame.top : layout.grid.top;
    assert.ok(gridTop >= logoBottom - EPSILON, `${label}: the grid clears the logo`);
  } else {
    const gridLeft = layout.scrollFrame ? layout.scrollFrame.left : layout.grid.left;
    assert.ok(gridLeft >= layout.logo.left + layout.logo.size - EPSILON, `${label}: the grid clears the logo pane`);
  }
  assert.ok(logoBottom >= 0, `${label}: the logo is on screen`);
}

let checks = 0;
for (const size of SIZES) {
  for (let cells = 1; cells <= 32; cells += 1) {
    for (const topBusy of [false, true]) {
      const label = `${size.name} n=${cells} busy=${topBusy}`;
      const layout = hubLayout({ cells, height: size.height, topBusy, width: size.width });
      assert.ok(layout.tile >= 64 - EPSILON, `${label}: tile ${layout.tile} is under the minimum`);
      assert.ok(layout.tile <= 101.2 + EPSILON, `${label}: tile ${layout.tile} is over the maximum`);
      assert.ok(layout.cols * layout.rows >= cells, `${label}: the grid holds every tile`);
      checkNoOverlap(layout, cells, label);
      checkInside(layout, size, label);
      checkLogoClear(layout, label);
      checks += 1;
    }
  }
}

const at = (size, cells) => hubLayout({ cells, height: size.height, width: size.width });
const [phone, small, landscape, tablet] = SIZES;

// 412x840 phone.
near(at(phone, 2).tile, 101.2, 'phone n=2');
assert.equal(at(phone, 2).cols, 2);
near(at(phone, 5).tile, 101.2, 'phone n=5');
assert.equal(at(phone, 5).cols, 3);
assert.equal(at(phone, 5).rows, 2);
near(at(phone, 9).tile, 101.2, 'phone n=9');
for (let cells = 10; cells <= 16; cells += 1) {
  near(at(phone, cells).tile, 78.7, `phone n=${cells}`);
  assert.equal(at(phone, cells).cols, 4);
  assert.equal(at(phone, cells).scrollFrame, undefined);
}
for (let cells = 17; cells <= 32; cells += 1) {
  near(at(phone, cells).tile, 78.7, `phone n=${cells}`);
  assert.equal(at(phone, cells).cols, 4);
  assert.ok(at(phone, cells).scrollFrame, `phone n=${cells} scrolls`);
  assert.equal(at(phone, cells).logo.size, 210);
}

// 375x647 small phone.
near(at(small, 2).tile, 101.2, 'small n=2');
near(at(small, 5).tile, 96.5, 'small n=5');
near(at(small, 9).tile, 80.6, 'small n=9');
near(at(small, 10).tile, 71.0, 'small n=10');
assert.equal(at(small, 12).logo.size, 210);
near(at(small, 16).tile, 71.0, 'small n=16');
assert.equal(at(small, 16).logo.size, 150);
near(at(small, 17).tile, 71.0, 'small n=17');
assert.ok(at(small, 17).scrollFrame, 'small n=17 scrolls');

// 780x380 landscape.
near(at(landscape, 2).tile, 101.2, 'landscape n=2');
near(at(landscape, 5).tile, 101.2, 'landscape n=5');
near(at(landscape, 9).tile, 97.9, 'landscape n=9');
near(at(landscape, 10).tile, 97.9, 'landscape n=10');
near(at(landscape, 16).tile, 72.0, 'landscape n=16');
near(at(landscape, 20).tile, 72.0, 'landscape n=20');
assert.ok(at(landscape, 21).scrollFrame, 'landscape n=21 scrolls');
assert.equal(at(landscape, 5).mode, 'landscape');

// 800x1200 tablet.
near(at(tablet, 2).tile, 101.2, 'tablet n=2');
near(at(tablet, 30).tile, 101.2, 'tablet n=30');
near(at(tablet, 31).tile, 88.7, 'tablet n=31');
near(at(tablet, 32).tile, 88.7, 'tablet n=32');
assert.equal(at(tablet, 32).rows, 6);

// The family layout keeps the two-thirds anchor: the block is centered on 2H/3 while it fits.
const family = at(phone, 5);
near(family.grid.top + family.grid.height / 2, (2 * phone.height) / 3, 'family grid center');
assert.equal(hubCellPosition(family, 3).left, 0, 'row 2 starts at the left column');

// A busy top moves the logo down only when the reserve binds.
assert.equal(hubLayout({ cells: 5, height: 840, topBusy: true, width: 412 }).logo.top, 175);
assert.equal(hubLayout({ cells: 5, height: 500, topBusy: true, width: 412 }).logo.top, 112);

// Landscape insets come off the width.
const notch = hubLayout({ cells: 5, height: 380, insetLeft: 44, insetRight: 44, width: 868 });
assert.ok(notch.logo.left >= 44, 'the logo clears the left inset');
assert.ok(notch.grid.left + notch.grid.width <= 868 - 44 + EPSILON, 'the grid clears the right inset');

process.stdout.write(`Hub grid tests passed: ${checks} layouts.\n`);
