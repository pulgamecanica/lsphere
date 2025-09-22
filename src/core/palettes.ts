import {
  schemeTableau10,
  schemeCategory10,
  schemeSet3,
  schemePaired,
  schemeDark2,
  schemeAccent,
  schemePastel1,
  schemePastel2,
  schemeSet1,
  schemeSet2,
} from 'd3-scale-chromatic';

export function pickD3Scheme(name?: string): readonly string[] {
  switch ((name ?? 'tableau10').toLowerCase()) {
    case 'category10':
      return schemeCategory10;
    case 'tableau10':
      return schemeTableau10;
    case 'set3':
      return schemeSet3;
    case 'paired':
      return schemePaired;
    case 'dark2':
      return schemeDark2;
    case 'accent':
      return schemeAccent;
    case 'pastel1':
      return schemePastel1;
    case 'pastel2':
      return schemePastel2;
    case 'set1':
      return schemeSet1;
    case 'set2':
      return schemeSet2;
    default:
      return schemeTableau10; // sensible default
  }
}
