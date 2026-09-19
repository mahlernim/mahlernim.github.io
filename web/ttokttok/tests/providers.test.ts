import { describe, expect, it } from 'vitest';

import { getProvider, providers } from '../src/providers';

describe('browser provider registry', () => {
  it('keeps every Android catalog identifier with an official-site-only web mode', () => {
    expect(providers.map((provider) => provider.id)).toEqual([
      'busan', 'seoul', 'yesco', 'samchully', 'incheon', 'daeryun', 'kiturami', 'koone',
      'cheongju', 'gumi', 'pohang', 'jeonnam', 'gangwon', 'jeonbuk', 'jb', 'jeonbukgas',
      'gunsan', 'jeju', 'kyungdong', 'cncity', 'daesung', 'daesungclean', 'knenergy',
      'seorabeol', 'gse', 'haeyang', 'chambit', 'mcenergy', 'seohae', 'daehwa', 'myungsung', 'other',
    ]);
    expect(new Set(providers.map((provider) => provider.id)).size).toBe(providers.length);
    expect(providers.every((provider) => provider.webMode === 'official-site')).toBe(true);
    expect(new Set(providers.map((provider) => provider.family))).toEqual(new Set([
      'SK E&S', '가스앱', '삼천리', 'EnergyTalk', '직접 공급사 포털', '직접 입력',
    ]));
  });

  it('exposes only descriptive fields and HTTPS official-site links', () => {
    for (const provider of providers) {
      expect(Object.keys(provider).sort()).toEqual(['family', 'id', 'name', 'regions', 'webMode', 'website']);
      expect(provider.website).toMatch(/^https:\/\//);
      expect(provider.regions.length).toBeGreaterThan(0);
    }
  });

  it('returns the direct-input fallback for an unknown provider without inventing a connection', () => {
    expect(getProvider('samchully')).toMatchObject({ id: 'samchully', webMode: 'official-site' });
    expect(getProvider('unknown-provider')).toBe(getProvider('other'));
  });
});
