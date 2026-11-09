import { defineTool, fail, type RunContext } from '@kotilo/kit-core';

type Opts = {
  kind: 'random' | 'passphrase';
  length: number;
  count: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  exclude: boolean;
  words: number;
  separator: string;
};

const AMBIGUOUS = new Set('0Oo1lI|');
const CLASSES = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&()*+,-./:;<=>?@[]^_{|}~',
} as const;
type ClassKey = keyof typeof CLASSES;

/** 1608 short, common, lowercase ASCII English words. */
const WORDS = 'able acid acorn acre actor adapt admit adult aged agent agree ahead aim air alarm album alert alien alley allow aloe alpha also amber amuse angle angry ankle ant apex apple april apron arc arch area arena argue aria arm army arrow art ash aside asset atlas atom attic audio aunt aura auto avid avoid awake award away axe axis baby back bacon badge bagel bake baker ball balmy bamboo band banjo bank barge barn base basil basin batch bath bay beach bead beam bean bear beard beat bee beet begin bell belt bench berry best bike bin bingo birch bird bite blade blank blast blaze blend bless blink bliss block bloom blue board boat body bog boil bold bolt bone bonus book boost boot booth born boss both bound bow bowl box boxer brain brake brand brass brave bread breeze brick bride brief bring brisk broad brook broom brown brush bud buddy bug buggy build bulb bull bun bunch bunny burn bus bush busy cab cabin cable cactus cadet cage cake calm camel camera camp canal candy cane canoe canvas canyon cap cape carbon card care cargo carpet carrot carry cart case cash cast castle cat cause cave cedar cell cello cereal chain chair chalk charm chart chase cheap check cheek cheer chef cherry chess chest chick chief child chili chill chin chip chop chord cider cinema circle citrus city civil claim clam clap class clay clean clear clerk clever click cliff climb clinic clip clock close cloth cloud clover clown club coach coal coast coat cobra cocoa cod code coffee cog coin cold color comb come comet comic cook cookie cool copper copy coral cord core corn cost cot cotton couch cougar count court cover cow coyote crab craft crane crash crate crawl crayon cream creek crew cricket crisp crop cross crowd crown crumb crush cub cube cubic cup curl curry curve cushion cute cycle dab dagger dairy daisy dance dancer dare dark dash data date dawn deal dear debt deck decor deep deer delta den denim dense depth derby desert desk detail dew dial diary dice diet dig dime dine diner dinner dirt disco dish ditch dive dizzy dock doctor dodge doll dolphin dome donkey donut door dose dot dove down draft drag dragon drain drama draw drawer dream dress drift drill drink drive driver drop drum dry duck dug dune dusk dust duty eager eagle ear early earn earth ease east easy echo eclipse edge eel effort egg eight elbow elder elegy elf elite elk elm ember empty emu end engine enjoy entry enzyme epic equal equip era error essay ethic even event exact exile exit extra fable fabric face fact fade fair fairy faith falcon fall fame family famous fan fancy farm farmer fast fasten fault fax feast feather fee feed feel fence fern ferry fetch fever few fiber fiddle field fifth fifty fig figure file film filter fin final find fine finger fir fire firm first fish fist fit five flag flame flash flat flavor flight flock flood floor flour flow flower fluid flute fly foam focus fog fold folder folk food fool foot force forest forge fork form fort forty forum fossil found fox frame free fresh frog front frost frozen fruit fuel full fun fund funnel fur fury fuse gadget gain galaxy gallon game gap garage garden garlic gate gaze gear gel gem genre gentle ghost giant gift gin ginger giraffe girl give glacier glad glass globe gloomy glove glow glue goal goat goblin gold golf good goose gospel gossip grab grace grade grain grand grant grape graph grass gravel gravy great green greet grid grill grin grip groom group grove grow guard guess guest guide guitar gulf gum gym habit hair half hall halo ham hammer hand handle happy harbor hard harp harvest hat hawk hay hazel head heap heart heat heavy hedge heel helmet help hem hen herb herd hermit hero hex hidden hike hill hint hip hire hobby hockey hog hold hole hollow holly home honest honey hood hook hop hope horn hornet horse host hotel hour house hub hue hug hum human humble humor hunger hunt hurry hut ice icicle icon idea idle igloo image impact inch index indoor ink inlet inn inner input insect iron island item ivory ivy jab jacket jade jaguar jam jar jaw jazz jeans jelly jet jewel jigsaw job jockey jog jogger join joke jolly journey joy judge jug juice jump jungle junior jury just kayak keen keep keg kernel kettle key kick kid kin kind king kite kitten kiwi knee knife knock knot koala lab label lace ladder ladle lady lagoon lake lamb lamp land lane lantern lap laptop large laser last late laugh lava lawn layer lazy leaf lean learn least leg legend lemon lemur lend lens letter level lever lid life lift light lily limb lime limit line lion lip list live lizard llama load loaf lobby lobster local lock locket lodge log logic long loop lord lose lot loud love loyal luck lumber lunar lunch lung lyric magic magnet maid mail main major make mammal mango manor maple marble march mark market marsh mask mass mat match math maze meadow meal meat medal mellow melon melt memo mentor menu merit mesh metal meter method mice midst might mild mile milk mill mind mint minus mirror mist mitten mix mixer model modem modest moist mole money monk monkey month mood moon moose mop moral more mosaic moss motel moth motor mouse mouth move movie much mud muffin mug mule museum music mustard myth nail name nap napkin narrow navy near neat neck nectar need needle nerve nest net new news next nib nice nickel night nine noble node noise noodle noon north nose note novel nurse nut nutmeg oak oar oasis oat ocean odd offer office often oil old olive omega onion open opera orb orbit order ore organ other otter ounce outer oval oven owl owner oxygen oyster pace pack pad paddle page paint pair palace palm pan panda panel paper parade park parrot part party pass past pasta path patio pause paw pea peace peach peak peanut pear pearl pebble pecan pedal peg pen pencil pepper perch pet petal phone photo piano pick pickle pie piece pig pigeon pillow pilot pin pine pink pipe pirate pit pitch pizza place plain plan plane planet plant plate play plaza plot plug plum plus pocket pod poem poet point polar pole pond pony poodle pool pop porch port pose post pot potato pouch power press pretzel price pride prime print prize proof proud pulse pump pun punch pup pupil puppy purse push puzzle python quack quartz queen quest quick quiet quilt quiz quote rabbit race rack radar radio radish raft rail rain raise raisin rake ram ramp ranch range rapid rare rate raven raw ray razor reach read ready real reef relax relay rent reply rest rhyme rib ribbon rice rich riddle ride ridge rifle right rim ring rinse ripe rise river road roast robe robin robot rock rocket rod rodent roll roof room root rope rose rough round route royal rub rug rule rumor run rural rush rust saddle safe sage sail salad salmon salt same sand sandal sap satin sauce save saw scale scarf scene scent school scoop score scout scrap screw scroll sea seal season seat secret seed sense sensor sequel serve seven shade shadow shake shape share shark sharp sheep shelf shell sherry shift shine ship shirt shoe shop shore short shout show shrub sick side sight sign signal silk silly silver simple sing sink sip siren sister site six size skate sketch ski skill skin skirt sky slate sled sleep slice slide slim slogan slope slow small smart smile smoke snack snail snake snow soap soccer sock socket sod soda sofa soft soil solar solid song sort soul sound soup south space spare spark speak speed spell spend spice spider spin spinach sponge spoon sport spot spray spring sprout spy square squash squid stable stack staff stage stair stamp stand star start state statue stay steak steam steel stem step stick sticky still sting stone stool stop store storm story stove straw stream street strip stripe studio study style sugar suit sum summer sun sunny sunset super surf swamp swan sweet swift swim swing sword syrup tab table tablet tactic tag tail take tale talent talk tall tame tan tank tape tar task taste taxi tea teach team teapot tell temple tempo ten tend tennis tent term test text thank theme thick thing third thorn thread three throw thumb ticket tide tidy tiger tile timber time tin tiny tip tire title toast today toe toffee token tomato tone tool tooth top topic torch total touch tour towel tower town toy track trade trail train tray treat tree trend trial tribe trick trip truck true trunk trust truth try tub tube tug tulip tuna tune tunnel turkey turn turnip turtle twig twin type ugly umpire uncle under union unit upper urban urn usage use usual valid valley value van vapor vase vat vault velvet verb verse vest video view villa vine vinyl violet violin visit vital vivid vocal voice volume vortex vote vow wad waffle wagon waist wait wake walk wall walnut walrus wand wander want warm wash wasp watch water wave wax way wealth wear web wedge week weld well west wet whale wheat wheel whip white whole wide width wig wild will wind window wine wing wink winter wire wise wish wizard wolf wood wool word work world worm worth wrap wrist write yacht yak yam yard yarn year yeast yellow yew yoga yogurt young youth zebra zero zinc zip zipper zone zoom'.split(' ');

const STRENGTH = {
  weak: 'tool.password.strength.weak',
  fair: 'tool.password.strength.fair',
  strong: 'tool.password.strength.strong',
  veryStrong: 'tool.password.strength.veryStrong',
} as const;

const strengthKey = (bits: number) =>
  bits < 40 ? STRENGTH.weak : bits < 60 ? STRENGTH.fair : bits < 100 ? STRENGTH.strong : STRENGTH.veryStrong;

/** Unbiased integers from ctx.random: bytes are drawn in pools, out-of-range values are rejected (no modulo bias). */
export function makeRng(ctx: RunContext) {
  let pool: Uint8Array = new Uint8Array(0);
  let pos = 0;
  const byte = () => {
    if (pos >= pool.length) {
      pool = ctx.random(1024);
      pos = 0;
    }
    return pool[pos++]!;
  };
  /** Uniform integer in [0, n), n ≤ 65536. */
  const int = (n: number): number => {
    if (n <= 1) return 0;
    const range = n <= 256 ? 256 : 65536;
    const limit = range - (range % n); // largest multiple of n that fits
    for (let tries = 0; tries < 100_000; tries++) {
      const v = n <= 256 ? byte() : byte() * 256 + byte();
      if (v < limit) return v % n;
    }
    throw new Error('random source keeps returning out-of-range values');
  };
  return { int };
}

function shuffle<T>(arr: T[], int: (n: number) => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export default defineTool<Opts>({
  id: 'password',
  category: 'generate',
  name: { en: 'Password generator', tr: 'Parola üretici' },
  description: { en: 'Generate random passwords or passphrases with entropy', tr: 'Entropisiyle rastgele parola veya parola cümlesi üret' },
  keywords: ['password', 'passphrase', 'random', 'entropy', 'parola', 'şifre', 'rastgele'],
  options: [
    { key: 'kind', type: 'segmented', values: ['random', 'passphrase'], default: 'random', hotkey: 'k' },
    { key: 'length', type: 'number', default: 20, min: 4, max: 256 },
    { key: 'count', type: 'number', default: 1, min: 1, max: 100 },
    { key: 'lower', type: 'toggle', default: true, hotkey: 'l' },
    { key: 'upper', type: 'toggle', default: true, hotkey: 'u' },
    { key: 'digits', type: 'toggle', default: true, hotkey: 'd' },
    { key: 'symbols', type: 'toggle', default: true, hotkey: 's' },
    { key: 'exclude', type: 'toggle', default: false, hotkey: 'x' },
    { key: 'words', type: 'number', default: 5, min: 3, max: 20 },
    { key: 'separator', type: 'text', default: '-' },
  ],
  run(_input, opts, ctx) {
    const { int } = makeRng(ctx);
    const out: string[] = [];
    let bits: number;

    if (opts.kind === 'passphrase') {
      bits = opts.words * Math.log2(WORDS.length);
      for (let n = 0; n < opts.count; n++) {
        const picked: string[] = [];
        for (let w = 0; w < opts.words; w++) picked.push(WORDS[int(WORDS.length)]!);
        out.push(picked.join(opts.separator));
      }
    } else {
      const sets = (Object.keys(CLASSES) as ClassKey[])
        .filter((k) => opts[k])
        .map((k) => [...CLASSES[k]].filter((c) => !opts.exclude || !AMBIGUOUS.has(c)));
      if (sets.length === 0) fail('error.password.noClass');
      // length is clamped to ≥ 4 (option spec) and there are 4 classes, so one-of-each always fits
      const all = sets.flat();
      bits = opts.length * Math.log2(all.length);
      for (let n = 0; n < opts.count; n++) {
        // one from each enabled class, the rest from the union, then an unbiased shuffle
        const chars = sets.map((s) => s[int(s.length)]!);
        while (chars.length < opts.length) chars.push(all[int(all.length)]!);
        out.push(shuffle(chars, int).join(''));
      }
    }

    const strength = strengthKey(bits);
    return {
      output: out.join('\n'),
      meta: { count: out.length, entropy: Math.round(bits), strength, strengthLabel: ctx.t(strength) },
    };
  },
  examples: [
    { input: '', opts: { length: 4 }, output: 'l5W-' },
    { input: '', opts: { length: 16, symbols: false }, output: 'rkVb5Wl8JnAYo2ZM' },
    { input: '', opts: { length: 12, count: 2, exclude: true }, output: '5A[U.f7;m_Gq\n=fqz[UM&_y52' },
    { input: '', opts: { kind: 'passphrase', words: 4 }, output: 'sing-organ-indoor-cabin' },
  ],
});
