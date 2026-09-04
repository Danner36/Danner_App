import { readFileSync } from 'node:fs';

const xml = readFileSync(process.argv[2], 'utf8');
const want = process.argv[3];
if (!want) {
  const labels = new Set();
  for (const match of xml.matchAll(/content-desc="([^"]+)"/g)) {
    if (match[1]) {
      labels.add(`D ${match[1]}`);
    }
  }
  for (const match of xml.matchAll(/text="([^"]+)"/g)) {
    if (match[1].trim()) {
      labels.add(`T ${match[1]}`);
    }
  }
  for (const label of labels) {
    process.stdout.write(`${label}\n`);
  }
  process.exit(0);
}
const escaped = want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = [
  new RegExp(
    `content-desc="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
  ),
  new RegExp(
    `text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
  ),
];
for (const pattern of patterns) {
  const match = pattern.exec(xml);
  if (match) {
    const x = Math.round((Number(match[1]) + Number(match[3])) / 2);
    const y = Math.round((Number(match[2]) + Number(match[4])) / 2);
    process.stdout.write(`${x} ${y}\n`);
    process.exit(0);
  }
}
process.exit(1);
