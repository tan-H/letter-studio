/* 写信工坊 · 写作引擎
   把「几个关键词」组装成一封有节奏的信：开场 → 记忆 → 关系 → 高潮句 → 收尾。
   同一份输入用同一随机种子，渲染结果稳定，不会每次刷新都换一套话。 */
(function (global) {
  'use strict';

  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 用户输入会进 innerHTML，必须转义，否则分享链接可被注入脚本 */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  const SCENES = [
    {
      key: 'thanks',
      name: '写一份感谢',
      hint: '有些「谢谢」当面说太轻，写下来才踏实',
      tone: 'warm',
      openers: [
        '有些「谢谢」当面说出来总觉得轻，写在纸上反而踏实。',
        '想了很久，还是决定写下来——有些话当面说会不好意思。',
        '翻了很多年前的记忆，挑了几件最想说的，写在这里。',
        '我一直觉得，被人认真放在心上，是很难得的事。'
      ],
      memFrames: [
        '关于{m}——这件事我一直记着。',
        '{m}。当时说得很轻，但我心里都记着。',
        '每次想到{m}，心里都是暖的。',
        '我记得{m}，记得比谁都清楚。'
      ],
      detailFrames: [
        '那天的光线、声音、当时的天气，我现在都还能想起来。',
        '当时我大概没说什么，但我心里把这一刻记了很久。',
        '后来我常常会想起那个片段，像翻一张旧照片。',
        '这件事没什么特别，但它在我这儿有分量。'
      ],
      midFrames: [
        '我们是{rel}，这件事我一直觉得挺难得的。',
        '说到底，{rel}——这段关系对我来说不普通。',
        '我们之间{rel}，日子久了，它就成了一种习惯。',
        '因为是{rel}，所以我更想把这些话说清楚。'
      ],
      coreFrames: [
        '其实我想说的，就一句话：',
        '所以认真讲一次：',
        '如果只能留一句，我想留这一句：'
      ],
      closers: [
        '谢谢你，真的。',
        '这些话当面说不出口，写下来也算说完了。',
        '剩下的时间，慢慢还你。',
        '不用回信，知道你看到就好。'
      ],
      wishFrames: [
        '往后也希望你顺顺利利，别的都不必多求。',
        '愿你往后被生活善待，也被自己善待。',
        '我把最好的都给你，你收着就好。'
      ]
    },
    {
      key: 'sorry',
      name: '写一句道歉',
      hint: '把拖了很久的那句「对不起」放下来',
      tone: 'solemn',
      openers: [
        '这封信我拖了很久才敢写。',
        '有些话想道歉，却总在心里替自己找一个「不用说」的理由。',
        '犹豫了很久，还是决定把话说明白。',
        '「对不起」这三个字，我反复打了又删，删了又打。'
      ],
      memFrames: [
        '{m}。那件事我一直记着，是我做得不对。',
        '关于{m}，我想说对不起。',
        '{m}——这件事，责任在我。',
        '提到{m}，我心里还是过不去。'
      ],
      detailFrames: [
        '当时你什么都没说，我却在心里反复掂量了很久。',
        '后来每次想起这个，我都在想当时换个说法会不会好些。',
        '那几天我心里其实很不好受，只是没敢讲。',
        '这件事已经过去很久了，但我知道你还记得。'
      ],
      midFrames: [
        '我们是{rel}，按理说这点事不至于，可它就是过不去。',
        '{rel}，我不该把这份在意丢给你一个人扛。',
        '我们之间{rel}，正因如此，我才更不能糊弄过去。',
        '因为是{rel}，所以这次我不想绕弯子。'
      ],
      coreFrames: [
        '所以我把真正想说的写在这里：',
        '我欠你一句：',
        '不找借口，我直说：'
      ],
      closers: [
        '不求你马上原谅，只是想让你知道。',
        '对不起。能做的我去做。',
        '时间会证明，但先让我把话放在这儿。',
        '原谅与否你决定，我该说的说完了。'
      ],
      wishFrames: [
        '往后我会更认真一点，不让你再替我担着。',
        '只愿这份难受，别再在你身上多留一天。',
        '我把该做的都记下了，慢慢给你看。'
      ]
    },
    {
      key: 'love',
      name: '写给想念的人',
      hint: '适合那些想说、又怕说得太直白的时刻',
      tone: 'soft',
      openers: [
        '有些话，适合在深夜写。',
        '今天没什么事，就是忽然很想跟你说说话。',
        '有个人在我生活里待了很久，久到我开始习惯有人在。',
        '如果这封信有一点点任性，那是因为它写给你。'
      ],
      memFrames: [
        '{m}。这些我都记得。',
        '关于{m}，我有一肚子的话。',
        '{m}——这样的时刻，一天里其实不多。',
        '{m}。想到的时候，心里是软的。'
      ],
      detailFrames: [
        '那会儿我们说了很多不着边际的话，时间过得特别快。',
        '后来我们都走了各自的路，可这段我一直留着。',
        '我到现在还记得当时的光，也记得你的表情。',
        '有些瞬间不发生第二次了，所以我格外记得。'
      ],
      midFrames: [
        '我们是{rel}，这份熟悉是时间给的。',
        '{rel}，说远近都不准，说在心上更准。',
        '我们之间{rel}，所以有些话我说得出口。',
        '因为是{rel}，你说什么我都愿意听完。'
      ],
      coreFrames: [
        '其实最想说的就一句：',
        '我把真心话放在这里：',
        '不绕弯子了：'
      ],
      closers: [
        '就先写到这。',
        '剩下的当面说。',
        '想你了，就这些。',
        '晚安。'
      ],
      wishFrames: [
        '愿你今晚睡个好觉，明天的事明天再说。',
        '愿你被惦记着，也记得惦记自己。',
        '我们来日方长，慢慢来。'
      ]
    },
    {
      key: 'birthday',
      name: '生日那天的一封',
      hint: '让「生日快乐」不只是四个字',
      tone: 'warm',
      openers: [
        '今天是你的日子，我想认真说点什么。',
        '又是一年，我先说一声：生日快乐。',
        '每年这一天我都会想，今年要跟你说什么。',
        '把平常不好意思说的话，挪到今天讲。'
      ],
      memFrames: [
        '{m}。那天的样子我记着。',
        '关于{m}，我一直记得很清楚。',
        '{m}——生日快乐，喜欢你的很多个瞬间之一。',
        '{m}。这样的日子一年一次，但不能只过一次。'
      ],
      detailFrames: [
        '那天的蛋糕我们分着吃完了，蜡烛是你非要插完的。',
        '许愿的时候你闭着眼，我在旁边偷偷看你。',
        '后来大家唱了歌，你笑得比谁都合拍。',
        '那天的照片我留着，翻出来每次都还是觉得好。'
      ],
      midFrames: [
        '我们是{rel}，你的生日我每年都想在场。',
        '{rel}，看着你一年年变好，这件事我上瘾。',
        '我们之间{rel}，你的重要日子我都记着。',
        '因为是{rel}，这一天我想认真过一次。'
      ],
      coreFrames: [
        '今年最想送你的祝福是：',
        '所以：',
        '我把今年的心愿写下来：'
      ],
      closers: [
        '生日快乐。',
        '愿你今年如愿。',
        '愿你想去的地方都去到。',
        '生日快乐，我很高兴认识你。'
      ],
      wishFrames: [
        '新的一岁，愿你想做的都能做成。',
        '愿你这一年都过得踏实，也都有惊喜。',
        '祝你岁岁平安，年年有盼头。'
      ]
    },
    {
      key: 'graduation',
      name: '毕业与分别',
      hint: '写给要各奔东西的同窗',
      tone: 'warm',
      openers: [
        '要走了，总觉得该写点什么。',
        '这个教室、这条走廊，以后大概只会出现在照片里。',
        '毕业这件事，热闹归热闹，散场的时候还是有点安静。',
        '这几年很短，短到我现在还觉得是刚来报到。'
      ],
      memFrames: [
        '{m}。那会儿我什么都不懂。',
        '关于{m}，我记得最清楚的是那天。',
        '{m}——这些以后想起来都会笑吧。',
        '{m}。当时觉得普通，现在觉得珍贵。'
      ],
      detailFrames: [
        '那会儿我们在走廊上聊到天黑，谁也不想回宿舍。',
        '后来每次说起来，都还是同一个笑话，同一批人。',
        '那几年过得快，回头看全是不值一提又很重要的小事。',
        '教室的位子、风扇的声音，我到现在都还记得。'
      ],
      midFrames: [
        '我们是{rel}，这几年你帮了我太多。',
        '{rel}，以后各奔东西，但这段我不打算忘。',
        '我们之间{rel}，这份交情不是同校才有的。',
        '因为是{rel}，我才敢把话说得这么满。'
      ],
      coreFrames: [
        '有一句话我一直没找到机会说：',
        '所以趁现在，认真说：',
        '最想让你知道的是：'
      ],
      closers: [
        '各自珍重，后会有期。',
        '祝你一路顺利。',
        '记得吃饭，记得睡觉。',
        '再见啦，同学。'
      ],
      wishFrames: [
        '愿你到哪儿都顺，别太拼了。',
        '愿你走自己的路，也不孤单。',
        '我们都要好好的，好多年后还能坐在一起。'
      ]
    },
    {
      key: 'cheer',
      name: '写给正在撑的人',
      hint: '在朋友最难的时候递过去一句',
      tone: 'soft',
      openers: [
        '写这封信的时候，你大概正有点难。',
        '我知道你现在可能不太好，所以认真写几句。',
        '有段时间特别难熬，我猜你现在就在那个阶段。',
        '本该当面说，但我想了想，还是写下来更好。'
      ],
      memFrames: [
        '{m}。你当时也是这么扛过来的。',
        '关于{m}，我记得你说过的那句话。',
        '{m}——你看，你以前也做成过。',
        '{m}。那件事你没当成回事，我记了很久。'
      ],
      detailFrames: [
        '那时候你也是这么一个人过来的，没人帮忙，你也没喊累。',
        '你当时说那句话的时候，声音很稳，我心里就踏实了。',
        '后来你缓过来了，比谁都快，我就知道你行。',
        '别人看到的是结果，我看到的是你熬过的那些夜里。'
      ],
      midFrames: [
        '我们是{rel}，你的能力我一直清楚。',
        '{rel}，我见过你扛事的样子。',
        '我们之间{rel}，所以我不打算跟你客气。',
        '因为是{rel}，我才更想说真话。'
      ],
      coreFrames: [
        '所以我只想告诉你一件事：',
        '重点是这句：',
        '如果只能留一句给你：'
      ],
      closers: [
        '慢慢来，会好的。',
        '扛不住就说话，别一个人硬撑。',
        '我在这呢。',
        '等你缓过来，我们再聊。'
      ],
      wishFrames: [
        '你只管往前走，累了就回头看看。',
        '愿你熬过这段，往后都是好日子。',
        '什么时候找我都在，不用客气。'
      ]
    }
  ];

  const SCENE_MAP = {};
  SCENES.forEach(s => { SCENE_MAP[s.key] = s; });

  /* v2 链接只传「配方」，收信人靠本地重排还原成文。
     所以句式库与 compose 规则一旦发布就冻结：改动会让已发出的老链接失真。
     以后要改词，请把 SCENES 复制成新版本放进 LIBS，并把 CURRENT_LIB 指过去。
     scenes 存深拷贝：LIBS[1] 必须与 SCENES 完全隔离，
     否则日后改 SCENES 会连带改掉老库，老链接重排出来的文字就变了。 */
  function cloneScenes(src) {
    return src.map(s => ({
      key: s.key, name: s.name, hint: s.hint, tone: s.tone,
      openers: s.openers.slice(),
      memFrames: s.memFrames.slice(),
      detailFrames: s.detailFrames.slice(),
      midFrames: s.midFrames.slice(),
      coreFrames: s.coreFrames.slice(),
      closers: s.closers.slice(),
      wishFrames: s.wishFrames.slice()
    }));
  }

  const LIBS = {
    1: { scenes: cloneScenes(SCENES), replyLead: '这封信我是收到了的。' }
  };
  const CURRENT_LIB = 1;

  /* 主题与场景的顺序即协议的一部分：链接里存的是下标，两端必须一致 */
  const THEME_KEYS = ['rose', 'sage', 'night', 'gold'];
  const SCENE_KEYS = SCENES.map(s => s.key);

  function libOf(v) {
    return LIBS[v] || LIBS[CURRENT_LIB];
  }

  function sceneOf(lib, key) {
    const scenes = libOf(lib).scenes;
    return scenes.filter(s => s.key === key)[0] || scenes[0];
  }

  /* 段落 → 页面。
     3D 翻页要求所有页等高，书的高度由内容最多的那页决定；
     分页若不均，短页就会留下大片空白。这里按累计内容长度找切点，
     让各页篇幅尽量接近，同时保证首页承载称呼、末页承载落款。 */
  function toPages(paras) {
    if (!paras.length) return [['']];
    if (paras.length === 1) return [[paras[0]]];

    const n = paras.length;
    const w = paras.map(p => String(p).length);
    const cum = [0];
    for (let i = 0; i < n; i++) cum.push(cum[i] + w[i]);
    const total = cum[n];

    /* 目标页数按「总字数 / 每页约 75 字」估算，而不是按段数——
       段有长有短，只按段数摊会让有的页很空 */
    const P = Math.min(4, Math.max(2, Math.round(total / 75)));

    const pages = [];
    let start = 0;
    for (let k = 1; k < P; k++) {
      const target = total * k / P;
      /* 切点：累计长度首次达到目标；且要给后面留够页数 */
      let end = start + 1;
      while (end < n - (P - k) && cum[end] < target) end++;
      /* 剩余页数不够时回退，把段落让给后续页 */
      while (end > start + 1 && n - end < P - k) end--;
      pages.push(paras.slice(start, end));
      start = end;
    }
    pages.push(paras.slice(start));
    return pages.filter(p => p.length);
  }

  function compose(ctx, seed, lib) {
    const L = libOf(lib);
    const scene = sceneOf(lib, ctx.scene);
    /* 种子必须由两端算出的同一串输入派生，
       所以这里只用「种子 + 场景 + 称呼 + 核心句」——都在配方里，收信人算得出同样的结果 */
    const rnd = mulberry32(hashStr(String(seed == null ? '' : seed) + '|' + ctx.scene + '|' + ctx.to + '|' + ctx.core));
    const pick = arr => arr[Math.floor(rnd() * arr.length)];

    const mems = (ctx.mems || []).filter(m => m && m.trim());
    const paras = [];

    paras.push(pick(scene.openers));
    /* 每条具体事展开成两段：一句点名 + 一句细节，读起来才像信不像模板 */
    mems.forEach(m => {
      paras.push(pick(scene.memFrames).replace('{m}', m.trim()));
      paras.push(pick(scene.detailFrames));
    });
    if (ctx.rel && ctx.rel.trim()) {
      paras.push(pick(scene.midFrames).replace('{rel}', ctx.rel.trim()));
    }
    if (ctx.core && ctx.core.trim()) {
      paras.push(pick(scene.coreFrames) + '**' + ctx.core.trim() + '**');
    }
    paras.push(pick(scene.wishFrames));
    paras.push(pick(scene.closers));

    return { pages: toPages(paras) };
  }

  /* 回信不是模板生成的，是收信人手写的正文。
     所以正文原样带上，只有「收到了」那句用句式库里的固定说法。 */
  function composeReply(body, sign, lib) {
    const L = libOf(lib);
    return {
      pages: [
        ['**回信**', body],
        [L.replyLead, '——' + sign]
      ]
    };
  }

  /* 配方 → 阅读端能直接用的信。
     收信人拿到链接后，本地用同一份句式库重排出逐字相同的正文。 */
  function materialize(recipe) {
    const lib = recipe.lib;
    const letter = {
      v: 2,
      scene: recipe.scene,
      theme: recipe.theme,
      to: recipe.to,
      sign: recipe.sign,
      rel: recipe.rel,
      date: recipe.date,
      unlock: recipe.unlock,
      music: !!recipe.music,
      float: !!recipe.float,
      replyTo: null,
      _recipe: recipe
    };

    if (recipe.kind === 'reply') {
      letter.pages = composeReply(recipe.body, recipe.sign, lib).pages;
      const o = recipe.orig || {};
      let summary = o.summary || '';
      let oTo = o.to || '';
      let oSign = o.sign || '';
      if (o.recipe) {
        /* 原信的配方在手，本地重排首段即可还原写信人当时看到的摘要 */
        const orig = materialize(o.recipe);
        summary = (orig.pages[0] || []).join(' ').slice(0, 80);
        oTo = o.recipe.to;
        oSign = o.recipe.sign;
      }
      /* to = 原信的收信人，sign = 原信的署名人。
         提示条说的是「原信写给谁」，所以要给收信人，不是署名人。 */
      letter.replyTo = { to: oTo, sign: oSign, summary: summary };
      return letter;
    }

    letter.pages = compose({
      scene: recipe.scene,
      to: recipe.to,
      sign: recipe.sign,
      rel: recipe.rel,
      core: recipe.core,
      mems: recipe.mems,
      date: recipe.date
    }, recipe.seed, lib).pages;

    return letter;
  }

  global.LetterEngine = {
    SCENES, SCENE_MAP, LIBS, CURRENT_LIB, THEME_KEYS, SCENE_KEYS,
    libOf, sceneOf, compose, composeReply, materialize, esc
  };
})(window);
