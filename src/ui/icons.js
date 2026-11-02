import { interfaceIcon } from '../studio/interface-runtime.js';
import { artRevision } from '../studio/direction.js';
// Original 12×12 pixel-art icons, defined as character grids and rendered to
// data URLs once at startup (no external image assets needed).

const PAL = {
  k: '#1a1218', K: '#3a2a30', w: '#fff6e0', W: '#c9c0b0', s: '#8a8296', S: '#4a4252',
  y: '#ffd75a', Y: '#c48a2c', o: '#ff8a2a', r: '#e0402c', R: '#8a1f1a', b: '#4a8cff', B: '#23458f',
  c: '#8fe0ff', g: '#7dc24a', G: '#3a6e24', n: '#a8743f', N: '#5a3a20', p: '#a678ff', P: '#5a3aa8',
  m: '#ff5aa8', l: '#fff0b0', t: '#5fd4b4',
};

/** @type {Record<string, string[]>} */
const ICONS = {
  purge: ['.....kk..l..', '....kWWk.l..', '....kwck.l..', '...kkwckk...', '..kwcccccK..', '.kwcccwcccK.', 'kwcccwwwcccK', 'kwccccwcccBk', 'kwcccccccBBk', '.kwccccccBk.', '..kkkkkkkk..', '............'],
  knife: ['..........kk', '.........kWk', '........kWsk', '.......kWsk.', '......kWsk..', '.....kWsk...', '....kWsk....', '..kkkkk.....', '..kNnk......', '.kNnk.......', 'kNnk........', 'kkk.........'],
  claw: ['k...k...k...', 'rk..rk..rk..', '.rk..rk..rk.', '.rrk.rrk.rrk', '..rk..rk..rk', '..rrk.rrk.rr', '...rk..rk..r', '...rrk.rrk..', '....rk..rk..', '....Rk..Rk..', '.....k...k..', '............'],
  tag: ['......kkkk..', '.....kllllk.', '....klllkllk', '...kllllllk.', '..klllllllk.', '.kllNlllllk.', 'kllNNllllk..', 'klllNlllk...', '.kllllllk...', '..kllllk....', '...kllk.....', '....kk......'],
  deal: ['............', '............', 'kk........kk', 'knk..kk..knk', 'knnkkllkknnk', 'kNnklllllnNk', '.kNlllkllNk.', '..kllkllkk..', '...klllk....', '....kkk.....', '............', '............'],
  pure: ['.....kk.....', '....kcck....', '....kcck....', '...kcwcck...', '...kcwcck...', '..kcwccccK..', '..kcccccck..', '.kccccccccK.', '.kcccccccck.', '.kcccccccBk.', '..kccccBBk..', '...kkkkkk...'],
  talk: ['.kkkkkkkkkk.', 'kwwwwwwwwwwk', 'kwwwwrrwwwwk', 'kwwwwrrwwwwk', 'kwwwwrrwwwwk', 'kwwwwrrwwwwk', 'kwwwwwwwwwwk', 'kwwwwrrwwwwk', 'kWwwwwwwwwWk', '.kkkkwwkkkk.', '.....kwk....', '......kk....'],
  awaken: ['.....k......', '....kpk.....', '.k..kpk..k..', '.kpkkwkkpk..', '..kpwwwpk...', 'kppwwlwwppk.', '..kpwwwpk...', '.kpkkwkkpk..', '.k..kpk..k..', '....kpk.....', '.....k......', '............'],
  bone: ['............', '.kk.......kk', 'kwwk.....kwk', 'kwWwk...kwwk', '.kwWwkkkwWk.', '..kwWwwwWk..', '..kWwwwWwk..', '.kWwkkkwWwk.', 'kwwk...kwWwk', 'kwk.....kwwk', 'kk.......kk.', '............'],
  fur: ['............', '..k...k...k.', '.kWk.kWk.kWk', '.kwWkkwWkkwk', 'kwwwWwwwWwwk', 'kwwwwwwwwwWk', 'kWwwwWwwwWWk', 'kWWwwWWwWWWk', '.kWWWWWWWWk.', '..kkkkkkkk..', '............', '............'],
  nest: ['............', '...kkkkkk...', '..kwwwwwWk..', '.kwwlwwwwWk.', '.kwwwwwwwWk.', '..kwwwwwWk..', 'knknkkkknknk', 'kNnNnnNnNnNk', '.kNnNnNnNnk.', '..kkkkkkkk..', '............', '............'],
  coin: ['....kkkk....', '..kkyyyykk..', '.kyyllyyyyk.', '.kylyyyyYyk.', 'kyylyyyyyYyk', 'kyyyyyyyyYyk', 'kyyyyyyyyYyk', 'kyyyyyyyYYyk', '.kyyyyyYYyk.', '.kyYYYYYyyk.', '..kkyyyykk..', '....kkkk....'],
  star: ['.....kk.....', '....kyyk....', '....kyyk....', 'kkkkyyyykkkk', 'kyyyyyyyyyYk', '.kyyyyyyyYk.', '..kyyyyyYk..', '..kyyyyyYk..', '.kyyYkkYYyk.', '.kyYk..kYyk.', 'kyYk....kYyk', 'kkk......kkk'],
  sun: ['.....kk.....', '..k..yy..k..', '...k....k...', '....kkkk....', '.k.kyyyyk.k.', 'kyykyllyykyy', 'yykyyyyyYkyk', '.k.kyyyYk.k.', '....kkkk....', '...k....k...', '..k..yy..k..', '.....kk.....'],
  menu: ['............', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kkkkkkkkkk.', '............', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kkkkkkkkkk.', '............', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kkkkkkkkkk.'],
  spoon: ['.........kk.', '........knk.', '.......knk..', '......knk...', '.....knk....', '....knk.....', '..kkkk......', '.knnnnk.....', 'knnnnnNk....', 'knnnnNNk....', '.kNNNNk.....', '..kkkk......'],
  pestle: ['........kk..', '.......kWsk.', '......kWsSk.', '.....kWsSk..', '....kWsSk...', '...kWsSk....', '..kWsSk.....', '.kWWsSk.....', '.kWsSSk.....', 'kWsSSk......', 'kSSSk.......', '.kkk........'],
  skimmer: ['..........kk', '.........kyk', '........kyk.', '.......kyk..', '..kkkkkyk...', '.kyWyWykk...', 'kyWsWsWyk...', 'kWsWsWsWk...', 'kyWsWsWyk...', 'kWsWsWsWk...', '.kyWyWyk....', '..kkkkk.....'],
  thermo: ['.....kk.....', '....kwwk....', '....kwsk....', '....kwsk....', '....kwrk....', '....kwrk....', '....kwrk....', '....kwrk....', '...krrrrk...', '..krrrrrrk..', '..krrrrRrk..', '...kkkkkk...'],
  lens: ['...kkkk.....', '..kccccK....', '.kcwccccK...', 'kcwccccccK..', 'kcccccccck..', 'kccccccccK..', '.kccccccK...', '..kccccKkk..', '...kkkkkNnk.', '.......kNnk.', '........kNnk', '.........kkk'],
  flask: ['....kkkk....', '....kwWk....', '....kwWk....', '...kkwWkk...', '..kwwwWWWk..', '.kwmmmmmmWk.', 'kwmmlmmmmmWk', 'kwmmmmmmmmWk', 'kwmmmmmmmPWk', '.kwmmmmmPWk.', '..kkkkkkkk..', '............'],
  lid: ['............', '.....kk.....', '....knnk....', '..kkkkkkkk..', '.kSsssssssk.', 'kSsWWWWWWssk', 'kssssssssssk', 'kkkkkkkkkkkk', '............', '............', '............', '............'],
  trash: ['....kkkk....', '.kkkkkkkkkk.', 'kWWWWWWWWWWk', '.kkkkkkkkkk.', '.kWsWsWsWsk.', '.kWsWsWsWsk.', '.kWsWsWsWsk.', '.kWsWsWsWsk.', '.kWsWsWsWsk.', '.kWsWsWsWsk.', '..kkkkkkkk..', '............'],
  speed: ['............', 'k.....k.....', 'kk....kk....', 'kyk...kyk...', 'kyyk..kyyk..', 'kyyyk.kyyyk.', 'kyyyk.kyyyk.', 'kyyk..kyyk..', 'kyk...kyk...', 'kk....kk....', 'k.....k.....', '............'],
  pause: ['............', '.kkkk..kkkk.', '.kwWk..kwWk.', '.kwWk..kwWk.', '.kwWk..kwWk.', '.kwWk..kwWk.', '.kwWk..kwWk.', '.kwWk..kwWk.', '.kwWk..kwWk.', '.kwWk..kwWk.', '.kkkk..kkkk.', '............'],
  gear: ['.....kk.....', '..k.kssk.k..', '.ksksWWsksk.', '..kWWkkWWk..', '.ksWk..kWsk.', 'ksWk....kWsk', 'ksWk....kWsk', '.ksWk..kWsk.', '..kWWkkWWk..', '.ksksWWsksk.', '..k.kssk.k..', '.....kk.....'],
  bag: ['....kkkk....', '...kN..Nk...', '...kN..Nk...', '..kkkkkkkk..', '.knnnnnnnnk.', 'knnnyynnnnNk', 'knnnyynnnnNk', 'knnnnnnnnnNk', 'knnnnnnnnnNk', 'knnnnnnnnNNk', '.kNNNNNNNNk.', '..kkkkkkkk..'],
  book: ['............', '.kkkkkkkkkk.', 'kRrrrrrrrrRk', 'kRryyyyyyrRk', 'kRrrrrrrrrRk', 'kRrrryyrrrRk', 'kRrrryyrrrRk', 'kRrrrrrrrrRk', 'kRrrrrrrrrRk', 'kRwwwwwwwwwk', 'kRkkkkkkkkkk', '.k..........'],
  scroll: ['..kkkkkkkk..', '.klllllllllk', 'k.kWWWWWWWlk', '.klllllllllk', '..klNNNNlk..', '..kllllllk..', '..klNNNNlk..', '..kllllllk..', '..klNNNlk...', '.kllllllllk.', 'klllllllll.k', '.kkkkkkkkkk.'],
  help: ['...kkkkkk...', '..kyyyyyyk..', '.kyykkkkyyk.', '.kyk....kyk.', '.kk....kyyk.', '......kyyk..', '.....kyyk...', '.....kyk....', '.....kkk....', '.....kyk....', '.....kyk....', '.....kkk....'],
  close: ['............', '.kk......kk.', 'krrk....krrk', '.krrk..krrk.', '..krrkkrrk..', '...krrrrk...', '...krrrrk...', '..krrkkrrk..', '.krrk..krrk.', 'krrk....krrk', '.kk......kk.', '............'],
  flame: ['.....k......', '....kok.....', '....kook....', '...koyok....', '..koyyok.k..', '..koyyyokok.', '.koyyllyook.', '.koylllyyok.', 'koyylllyyok.', 'koyyllyyyok.', '.kooyyyook..', '..kkkkkkk...'],
  snow: ['.....kk.....', '..k..cc..k..', '...kkcckk...', 'k..kcwwck..k', '.kkcwccwckk.', 'kccwcwwcwcck', 'kccwcwwcwcck', '.kkcwccwckk.', 'k..kcwwck..k', '...kkcckk...', '..k..cc..k..', '.....kk.....'],
  heart: ['............', '.kkk...kkk..', 'krrrk.krrrk.', 'krlrrkrrrRk.', 'krrrrrrrrRk.', 'krrrrrrrrRk.', '.krrrrrrRk..', '..krrrrRk...', '...krrRk....', '....kRk.....', '.....k......', '............'],
  eye: ['............', '...kkkkkk...', '.kkppppppkk.', 'kppkkkkkkppk', 'kpkcwbbbbkpk', 'kpkwbbBBbkpk', 'kpkcbbBBbkpk', 'kppkkkkkkppk', '.kkppppppkk.', '...kkkkkk...', '............', '............'],
  shield: ['kkkkkkkkkkkk', 'kWssssssssWk', 'kssyssssysSk', 'ksyyyssyyySk', 'kssyyyyyysSk', 'kssyyyyyysSk', '.ksyyyyyySk.', '.kssyyyysSk.', '..kssyysSk..', '...kssSSk...', '....kSSk....', '.....kk.....'],
  scales: ['.....kk.....', '....kyyk....', 'kkkkkyykkkkk', 'kyyyyyyyyyyk', '.k...yy...k.', 'kyk..yy..kyk', 'kyk..yy..kyk', 'kkkk.yy.kkkk', '.....yy.....', '...kkyykk...', '..kyyyyyyk..', '..kkkkkkkk..'],
  bubbles: ['.......kk...', '......kcwk..', '......kcck..', '.kkk...kk...', 'kcwck.......', 'kccck..kkk..', '.kkk..kcwck.', '.....kcccck.', '..kk.kcccck.', '.kcwk.kccck.', '.kcck..kkk..', '..kk........'],
  weight: ['....kkkk....', '....k..k....', '...kkkkkk...', '..kSssssSk..', '..kssssssk..', '.kSsswWsssk.', '.kssssssssk.', 'kSsssssssssk', 'ksssssssssSk', 'kssssssssSSk', 'kSSSSSSSSSSk', 'kkkkkkkkkkkk'],
  drop: ['.....kk.....', '.....kbk....', '....kbbk....', '....kbbbk...', '...kbcbbk...', '...kbcbbbk..', '..kbccbbbk..', '..kbcbbbbBk.', '..kbbbbbbBk.', '..kbbbbbBBk.', '...kbbBBBk..', '....kkkkk...'],
  palette: ['...kkkkkk...', '..kllllllk..', '.klrrllbblk.', 'kllrrllbbllk', 'kllllllllllk', 'klggllkklllk', 'klggllk.klk.', 'kllllk...k..', 'klyylk......', '.klyylk.....', '..kllllkk...', '...kkkk.....'],
  lock: ['...kkkkkk...', '..kSsssssk..', '..ksk..ksk..', '..ksk..ksk..', '.kkkkkkkkkk.', '.kyyyyyyyyk.', '.kyyykkyyyk.', '.kyyykkyyYk.', '.kyyyykyyYk.', '.kyyyyyyYYk.', '.kkkkkkkkkk.', '............'],
  check: ['............', '..........kk', '.........kgk', '........kggk', '.k.....kggk.', 'kgk...kggk..', 'kggk.kggk...', '.kggkggk....', '..kgggk.....', '...kgk......', '....k.......', '............'],
  bulb: ['...kkkkk....', '..kllllyk...', '.kllwlllyk..', '.klwllllyk..', '.klllllllyk.', '.kllllllyyk.', '..kllllyyk..', '...kllyyk...', '...kWWWWk...', '...kSSSSk...', '...kWWWWk...', '....kkkk....'],
  door: ['..kkkkkkkk..', '.knnnnnnnnk.', '.knNnnnnNnk.', '.knNnnnnNnk.', '.knnnnnnnnk.', '.knNnnnnNnk.', '.knNnnnnyyk.', '.knnnnnnyyk.', '.knNnnnnNnk.', '.knNnnnnNnk.', '.knnnnnnnnk.', 'kkkkkkkkkkkk'],
  minus: ['............', '............', '............', '............', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kWWWWWWWWk.', '.kkkkkkkkkk.', '............', '............', '............', '............'],
  fit: ['kkkkk..kkkkk', 'kwwwk..kwwwk', 'kwkk....kkwk', 'kwk......kwk', 'kk........kk', '............', '............', 'kk........kk', 'kwk......kwk', 'kwkk....kkwk', 'kwwwk..kwwwk', 'kkkkk..kkkkk'],
  plus: ['............', '....kkkk....', '....kgGk....', '....kgGk....', '.kkkkgGkkkk.', '.kgggggggGk.', '.kGGGgGGGGk.', '.kkkkgGkkkk.', '....kgGk....', '....kGGk....', '....kkkk....', '............'],
  jar: ['...kkkkkk...', '...knnnnk...', '..kkkkkkkk..', '..kcwwwwck..', '.kcwbbbbbck.', '.kwbbbbbbbk.', '.kwbbcbbbbk.', '.kwbbbbbbBk.', '.kwbbbbbbBk.', '.kcbbbbbBck.', '..kkkkkkkk..', '............'],
  ladle: ['............', '.......kkkk.', '......kWWsk.', '.....kWsk...', '....kWsk....', '...kWsk.....', '.kkkkk......', 'kWyyyWk.....', 'kyWyWyk.....', 'kWyWyWk.....', '.kkkkk......', '............'],
  alembic: ['......kkk...', '.....kyyyk..', '....kykkyk..', '...kyk..kyk.', '..kkkk...kyk', '.kyyyyk...kk', 'kyyyyyyk..kk', 'kyyyyyyyk.kk', 'kyyyyyyyk.k.', '.kyyyyyk....', '..kkkkk.....', '............'],
  homunculus: ['...kkkkkk...', '..kyyyyyyk..', '..kykkykyk..', '..kyyyyyyk..', '...kkyykk...', '.kkyyyyyykk.', 'ky.kyyyyk.yk', '...kyyyyk...', '...kykkyk...', '...kyk.kyk..', '..kyyk.kyyk.', '..kkk...kkk.'],
  rune: ['kkkkkkkkkkkk', 'kSSSSSSSSSSk', 'kSScSSSScSSk', 'kSSScSScSSSk', 'kSSSScSSSSSk', 'kScccccccSSk', 'kSSSScSSSSSk', 'kSSScSScSSSk', 'kSScSSSScSSk', 'kSSSSSSSSSSk', 'kkkkkkkkkkkk', '............'],
  shelf: ['kkkkkkkkkkkk', 'k.kbk.kgk..k', 'k.kbk.kgkkkk', 'k.kbk.kgkryk', 'kNNNNNNNNNNk', 'k..kpk.kyk.k', 'k..kpk.kyk.k', 'kNNNNNNNNNNk', 'k.kkkk.kmk.k', 'k.kWWk.kmk.k', 'kNNNNNNNNNNk', 'k..........k'],
  charter: ['.kkkkkkkkkk.', 'klllllllllNk', '.kllllllllk.', '.klNNNNNlk..', '.kllllllllk.', '.klNNNNNNlk.', '.kllllllllk.', '.klNNNlrrrk.', '.kllllrrrrk.', 'klllllrrrrk.', '.kkkkkkrrk..', '.......kk...'],
  cauldron: ['............', '..kkkkkkkk..', '.kSSSSSSSSk.', 'kSkkkkkkkkSk', 'kSkggggggkSk', 'kSSkggggkSSk', 'kSSSSSSSSSSk', 'kSSSSSSSSSSk', '.kSSSSSSSSk.', '..kkSSSSkk..', '..kk.kk.kk..', '............'],
  fire: ['......k.....', '.....kok....', '....koyok...', '...koyyok.k.', '...koylyokok', '..koyllyyok.', '..koyllyyok.', '...koyyyok..', '.kkkkkkkkkk.', 'kNnnkNNknnNk', '.kNNnnnnNNk.', '..kkkkkkkk..'],
  cauldron2: ['............', '..kkkkkkkk..', '.kYYYYYYYYk.', 'kYkkkkkkkkYk', 'kYkbbbbbbkYk', 'koYkbbbbkYok', 'koooooooooYk', 'kooyoooooYYk', '.kooooooYYk.', '..kkooYYkk..', '..kk.kk.kk..', '............'],
  cauldron3: ['.k........k.', 'kykkkkkkkkyk', '.kyyyyyyyyk.', 'kykkkkkkkkyk', 'kykppppppkyk', 'kSykppppkySk', 'kSSyyyyyySSk', 'kSSSSSSSSSSk', 'kSSSSSSSSSSk', '.kSSSSSSSSk.', '.kkkSSSSkkk.', '.kk.kkkk.kk.'],
  shelf2: ['kkkkkkkkkkkk', 'kbkgkrkykmkk', 'kbkgkrkykmkk', 'kNNNNNNNNNNk', 'kpkykckbkgkk', 'kpkykckbkgkk', 'kNNNNNNNNNNk', 'kmkWkrkpkykk', 'kmkWkrkpkykk', 'kNNNNNNNNNNk', 'k..........k', 'kk........kk'],
  furnace: ['..kkkkkkkk..', '.kssssssssk.', 'kssSSSSSSssk', 'ksSkkkkkkSsk', 'ksSkooyokSsk', 'ksSkoyyokSsk', 'ksSkkkkkkSsk', 'kssssssssssk', 'ksSsSsSsSsSk', 'kssssssssssk', 'kkkkkkkkkkkk', '............'],
  bellows: ['............', '.kkkkkk.....', 'knnnnnnk....', 'knNnNnnnkkkk', 'knnnnnnnkyyk', 'knNnNnnnkkkk', 'knnnnnnk....', '.kkkkkk.....', '.kN..Nk.....', '.kN..Nk.....', 'kkk..kkk....', '............'],
  basin: ['............', '............', 'kkkkkkkkkkkk', 'kWbbbbbbbbWk', 'kWbcbbbcbbWk', '.kWbbbbbbWk.', '.kWWWWWWWWk.', '..kkkkkkkk..', '............', '............', '............', '............'],
  hydro: ['.....kk.....', '.....kwk....', '.....kwk....', '.....krk....', '.....kwk....', '.....krk....', '....kwwwk...', '...kwwwwwk..', '...kwyyywk..', '...kwyyywk..', '....kwwwk...', '.....kkk....'],
  visco: ['..kkkkkkk...', '..kwbbbbk...', '..kwbbbbk...', '..kwbkkbk...', '..kwkSSkk...', '..kwbkkbk...', '..kwbbbbk...', '..kwbbbbk...', '..kwbbbbk...', '..kwbbbbk...', '..kkkkkkk...', '............'],
  assay: ['............', '.kk.kk.kk...', '.kwkkwkkwk..', '.kwkkwkkwk..', '.krkkgkkbk..', '.krkkgkkbk..', '.krkkgkkbk..', 'kkkkkkkkkkk.', 'knnnnnnnnnk.', 'kNNNNNNNNNk.', 'kkkkkkkkkkk.', '............'],
  monocle: ['....kkkk....', '...krrrok...', '..kroyyyok..', '..koyyyyyk..', '..kryyyyok..', '..krroyyrk..', '...krrrrk...', '....kkkk.k..', '.........k..', '..........k.', '...........k', '............'],
  pour: ['............', '..kkkkkk....', '..knnnnk....', '.kkkkkkkk...', '.kcwwwwck...', 'kwbbbbbbbk..', 'kwbbbbbbbkk.', 'kwbbbbbbbbbk', '.kbbbbbbk.kb', '..kkkkkk...b', '...........b', '...........b'],
  fist: ['............', '...kkkkkk...', '..kyykyykk..', '.kyykyykyyk.', '.kyykyykyyk.', '.kyyyyyyyyk.', 'kkyyyyyyyyk.', 'kyyyyyyyyYk.', '.kyyyyyyYk..', '..kyyyyYYk..', '..kYYYYYk...', '..kkkkkkk...'],
  rose: ['....kkkk....', '...kmmmmk...', '..kmmlmmmk..', '..kmlmmlmk..', '..kmmmmmmk..', '...kmmmmk...', '....kkkk.k..', '.....kg.kgk.', '..kk.kgkgk..', '.kgGkkgGk...', '..kkk.kgk...', '......kk....'],
  swirl: ['...kkkkk....', '..kttttk....', '.ktkkkk.....', 'ktk..kkkk...', 'ktk.kttttk..', 'ktk.ktkktk..', 'ktk..kk.ktk.', '.ktk....ktk.', '..ktkkkktk..', '...ktttttk..', '....kkkkk...', '............'],
  acid: ['...kkkkkk...', '....kwWk....', '....kwWk....', '...kwwWWk...', '..kwgw.gWk..', '..kgygyggk..', '.kgyggygggk.', '.kggyggyggk.', 'kggggggggGGk', 'kggygggggGGk', '.kkkkkkkkkk.', '............'],
  skull: ['............', '...kkkkkk...', '..kwwwwwwk..', '.kwwwwwwwWk.', '.kwkkwwkkWk.', '.kwkkwwkkWk.', '.kwwwkkwwWk.', '..kwwwwwWk..', '...kwkwkWk..', '...kwkwkk...', '....kkkk....', '............'],
  death: ['.....kk.....', '....kppk....', '...kpPPpk...', '...kpkkpk...', '..kpPkkPpk..', '..kpPPPPpk..', '.kpPPPPPPpk.', '.kpPPPPPPpk.', 'kpPPPPPPPPpk', 'kpPkPPkPPkpk', 'kpk.kk.kk.kk', 'kk..........'],
  mortar: ['..........kk', '.........kWk', '........kWk.', '.......kWk..', '......kWk...', '.kkkkkWkkkk.', 'kWWWWsWWWWsk', '.kssssssssk.', '.kssssssssk.', '..kssssssk..', '...kkkkkk...', '..kkkkkkkk..'],
  galvo: ['..kkkkkkkk..', '.kwwwwwwwwk.', 'kwwkwwwwkwwk', 'kwwwwwwkwwwk', 'kwwwwwkwwwwk', 'kwwwwkwwwwwk', 'kwwwryrwwwwk', 'kSSSSSSSSSSk', 'kSyySSSSbbSk', 'kSSSSSSSSSSk', '.kkkkkkkkkk.', '............'],
  rabbit: ['..kk..kk....', '.kwk.kwk....', '.kmk.kmk....', '.kwk.kwk....', '..kwkwwk....', '.kwwwwwwk...', '.kwkwwwwk...', '.kwwwwwwwkk.', '..kwwwwwwwk.', '..kwwwwwwWk.', '...kwkkwkk..', '...kk..kk...'],
  beetle: ['..k......k..', '...k....k...', '...kkkkkk...', '..kGgggggk..', '.kGgkgGkggk.', 'kkGggkGggGkk', '.kGggkGggGk.', 'kkGggkGggGkk', '.kGggkGggGk.', '..kGGkGGGk..', '...kkkkkk...', '............'],
  seedling: ['............', '...kk..kk...', '..kgGkkgGk..', '..kggGkggk..', '...kgGgGk...', '.....kGk....', '.....kGk....', '..kkkkkkkk..', '..knnnnnnk..', '..knNnnnnk..', '...knnnnk...', '...kkkkkk...'],
  stone: ['............', '............', '....kkkkk...', '..kkWWWsskk.', '.kWWsssssSk.', '.kWssssssSSk', 'kWsssssssSSk', 'kssssssssSSk', 'kSssssssSSSk', '.kSSSSSSSSk.', '..kkkkkkkk..', '............'],
  wisp: ['.....k......', '....kck.....', '....kcck....', '...kcwck....', '..kcwwwck...', '..kcwlwck...', '.kcwwlwwck..', '.kcwlllwck..', '.kcwwlwwck..', '..kcwwwck...', '...kccck....', '....kkk.....'],
  satchel: ['...kkkkkk...', '..kN....Nk..', '.kN......Nk.', 'kkkkkkkkkkkk', 'knnnnnnnnnnk', 'knnnkyykknnk', 'knnnkyykknnk', 'knnnnkknnnNk', 'knnnnnnnnnNk', 'knnnnnnnnNNk', '.kNNNNNNNNk.', '..kkkkkkkk..'],
  shroom: ['............', '...kkkkkk...', '..kpPpppPk..', '.kppwpppwppk', 'kpPppppppPpk', 'kkkkkkkkkkkk', '....kwwk....', '....kwWk....', '....kwWk....', '...kwwwWk...', '..kkkkkkkk..', '............'],
  tree: ['....kkkk....', '..kkgggGkk..', '.kgggggggGk.', 'kgggGgggggGk', 'kggggggGgggk', 'kgGgggggggGk', '.kgggggGgGk.', '..kkkNnkkk..', '.....kNk....', '.....kNk....', '....kNnNk...', '..kkkkkkkk..'],
  stall: ['kkkkkkkkkkkk', 'krrwwrrwwrrk', 'krrwwrrwwrrk', '.kkkkkkkkkk.', '.kn......nk.', '.kn.kmk..nk.', '.kn.kmk..nk.', 'kkkkkkkkkkkk', 'knnnnnnnnnnk', 'knNnnnnnNnnk', 'knnnnnnnnnnk', 'kkkkkkkkkkkk'],
  dropper: ['..........kk', '.........kmk', '........kmmk', '.......kmmk.', '......kwWk..', '.....kwWk...', '....kwWk....', '...kwWk.....', '..kwWk......', '.kcWk.......', '.kck........', '..k.........'],
  leaf: ['..........kk', '........kkgk', '......kkgggk', '....kkgggGgk', '...kgggGgggk', '..kggGgggggk', '..kgGgggggk.', '.kgGgggggk..', '.kGgggGkk...', 'kGgkkkk.....', 'kk..........', '............'],
  gem: ['............', '...kkkkkk...', '..kpwppPPk..', '.kpwpppPPPk.', 'kkkkkkkkkkkk', '.kpwpppPPk..', '..kpwppPk...', '...kpwPk....', '....kpk.....', '.....k......', '............', '............'],
  pick: ['..kkkk......', '.kWWWWkk....', 'kWSSSSWWk...', '.kk..kSWk...', '......kNnk..', '.......kNnk.', '........kNnk', '.........kNk', '..........kk', '............', '............', '............'],
  trowel: ['.........kk.', '........knNk', '.......knNk.', '......knNk..', '.....kkkk...', '....kWWsk...', '...kWwWsk...', '..kWwWWsk...', '.kWwWWsSk...', '.kWWWsSk....', 'kWsSSkk.....', 'kkkk........'],
  sickle: ['....kkkk....', '..kkWWWWk...', '.kWWkkkWWk..', 'kWWk...kWk..', 'kWk.....kk..', 'kWk.........', 'kWk.........', '.kWk....kk..', '..kWkk.knk..', '...kkWkNk...', '......kNk...', '.......kk...'],
  brush: ['........kk..', '.......knk..', '......knk...', '.....knk....', '....knk.....', '...kNNk.....', '..kYYYYk....', '.kyyyyyk....', 'kWkWkWkWk...', 'kWkWkWkWk...', '.kkkkkkk....', '............'],
  bolt: ['......kkkk..', '.....kyyyk..', '....kyyyk...', '...kyyyk....', '..kyyyykkk..', '.kyyyyyyyk..', '..kkkyyyk...', '....kyyk....', '...kyyk.....', '..kyyk......', '..kyk.......', '..kk........'],
  spark: ['.....k......', '....kyk.....', '....kyk..k..', '.k..kyk.kyk.', 'kyk.kyykyk..', '.kyykyyyk...', '..kyyllyyk..', '...kyyykyyk.', '..kyk.kyk.k.', '.kyk..kyk...', '..k....k....', '............'],
  bottle: ['....kkkk....', '....knnk....', '....kWWk....', '...kwwWWk...', '..kwmmmmWk..', '.kwmmlmmmWk.', '.kwmmmmmmWk.', '.kwmmmmmmPk.', '.kwmmmmmPWk.', '..kwmmmPWk..', '...kkkkkk...', '............'],
  trophy: ['.kkkkkkkkkk.', 'kykyyyyyykyk', 'kyykyyyykyyk', '.kyyyyyyyyk.', '..kyyyyyYk..', '...kyyyYk...', '....kyYk....', '.....kk.....', '....kyYk....', '...kkkkkk...', '..kyyyyyYk..', '..kkkkkkkk..'],
  clock: ['...kkkkkk...', '..kwwwwwwk..', '.kwwwkwwwwk.', 'kwwwwkwwwwWk', 'kwwwwkwwwwWk', 'kwwwwkkkkwWk', 'kwwwwwwwwwWk', 'kwwwwwwwwwWk', '.kwwwwwwwWk.', '..kWWWWWWk..', '...kkkkkk...', '............'],
};

const cache = new Map();

/**
 * Data URL for an icon (rendered once).
 * @param {string} name @param {number} [scale]
 */
export function iconUrl(name, scale = 1) {
  const key = artRevision() + ':' + name + ':' + scale;
  const custom = interfaceIcon(name, 12 * scale);
  if (custom) return custom;
  if (cache.has(key)) return cache.get(key);
  const grid = ICONS[name] || ICONS.help;
  const n = 12;
  const cv = document.createElement('canvas');
  cv.width = n * scale;
  cv.height = n * scale;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < n; y++) {
    const row = grid[y] || '';
    for (let x = 0; x < n; x++) {
      const ch = row[x];
      if (!ch || ch === '.') continue;
      ctx.fillStyle = PAL[ch] || '#ff00ff';
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  const url = cv.toDataURL();
  if (cache.size > 500) cache.clear();
  cache.set(key, url);
  return url;
}

/** An <img> element for an icon. */
export function icon(name, cls = '') {
  const img = document.createElement('img');
  img.src = iconUrl(name, 1);
  img.alt = '';
  img.className = 'ico ' + cls;
  img.draggable = false;
  return img;
}

export const ICON_NAMES = Object.keys(ICONS);
export { ICONS };
