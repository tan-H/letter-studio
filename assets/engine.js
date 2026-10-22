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
      { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c]
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
      ]
    }
  ];

  const SCENE_MAP = {};
  SCENES.forEach(s => { SCENE_MAP[s.key] = s; });

  /* 段落 → 页面。首尾单独成页，中间记忆点两两成页，读起来有呼吸。 */
  function toPages(paras) {
    const pages = [];
    if (!paras.length) return [['']];
    pages.push([paras[0]]);
    const mid = paras.slice(1, -1);
    const tail = paras[paras.length - 1];
    let i = 0;
    while (i < mid.length) {
      pages.push(mid.slice(i, i + 2));
      i += 2;
    }
    pages.push([tail]);
    return pages;
  }

  function compose(ctx, seed) {
    const scene = SCENE_MAP[ctx.scene] || SCENES[0];
    const rnd = mulberry32(hashStr(String(seed || '') + '|' + ctx.scene + '|' + ctx.to + '|' + ctx.core));
    const pick = arr => arr[Math.floor(rnd() * arr.length)];

    const mems = (ctx.mems || []).filter(m => m && m.trim());
    const paras = [];

    paras.push(pick(scene.openers));
    mems.forEach(m => paras.push(pick(scene.memFrames).replace('{m}', m.trim())));
    if (ctx.rel && ctx.rel.trim()) {
      paras.push(pick(scene.midFrames).replace('{rel}', ctx.rel.trim()));
    }
    if (ctx.core && ctx.core.trim()) {
      paras.push(pick(scene.coreFrames) + '**' + ctx.core.trim() + '**');
    }
    paras.push(pick(scene.closers));

    return { pages: toPages(paras) };
  }

  global.LetterEngine = { SCENES, SCENE_MAP, compose, esc };
})(window);
