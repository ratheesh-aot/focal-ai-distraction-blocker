// Turns src/shared/adDomains.json into a declarativeNetRequest static ruleset.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const domains = JSON.parse(readFileSync('src/shared/adDomains.json', 'utf8'));
const rules = domains.map((d, i) => ({
  id: i + 1,
  priority: 1,
  action: { type: 'block' },
  condition: {
    requestDomains: [d],
    resourceTypes: ['sub_frame', 'script', 'image', 'xmlhttprequest', 'media', 'ping', 'other'],
  },
}));
mkdirSync('public/rules', { recursive: true });
writeFileSync('public/rules/ad-domains.json', JSON.stringify(rules, null, 1));
console.log(`wrote ${rules.length} rules to public/rules/ad-domains.json`);
