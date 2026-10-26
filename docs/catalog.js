'use strict';
const ELEMENTS={木:{color:'#91dda0',key:'wood'},火:{color:'#ff9b73',key:'fire'},水:{color:'#8fd9ef',key:'water'},光:{color:'#f9df91',key:'light'},闇:{color:'#c49bea',key:'dark'}};
// Each family has three individually illustrated, permanently linked forms.
const FAMILY_ROWS=[
['leaf','コロ','翠角竜コロ','森羅の翠冠竜コロ','木','ドラゴン','guard',2,105,24,'starter',0,0],
['fire','ルゥ','焔翼竜ルゥ','紅蓮の焔帝竜ルゥ','火','ドラゴン','power',2,80,32,'starter',0,1],
['water','ミオ','蒼潮竜ミオ','深海の蒼王竜ミオ','水','ドラゴン','heal',2,95,26,'starter',0,2],
['moon','ノクス','月影獣ノクス','冥月の獣王ノクス','闇','獣','power',5,270,95,'gacha',0,3],
['sun','レオン','暁天竜レオン','万天の聖帝竜レオン','光','ドラゴン','guard',6,400,145,'gacha',0,4],
['ice','フィン','氷晶狐フィン','九天の氷晶狐フィン','水','精霊','heal',5,300,88,'gacha',0,5],
['golem','モス','苔石兵モス','古森の巨神兵モス','木','ゴーレム','guard',2,155,18,'drop',0,6],
['owl','リーフィ','森梟リーフィ','星詠みの大梟リーフィ','木','鳥','heal',3,120,35,'drop',0,7],
['salamander','サラ','火蜥蜴サラ','灼獄の熔鱗竜サラ','火','獣','power',2,90,29,'drop',0,8],
['phoenix','フェニカ','焔鳥フェニカ','不滅の焔凰フェニカ','火','鳥','revive',5,250,105,'gacha',0,9],
['seal','シール','氷海獣シール','氷洋の海皇シール','水','獣','guard',2,145,21,'drop',0,10],
['mermaid','ネリア','珊瑚姫ネリア','蒼海の歌姫ネリア','水','精霊','heal',3,120,31,'drop',0,11],
['beetle','ギア','機甲虫ギア','黄金機兵ギア','光','マシン','pierce',3,150,40,'drop',1,0],
['bat','ヴァン','夜魔ヴァン','宵闇の魔王ヴァン','闇','悪魔','drain',3,100,44,'drop',1,1],
['rabbit','ルナ','月兎ルナ','月詠みの仙兎ルナ','光','精霊','heal',3,110,33,'drop',1,2],
['mushroom','ポロ','菌樹人ポロ','万緑の樹祖ポロ','木','精霊','heal',2,125,20,'drop',1,3],
['minotaur','バル','斧戦士バル','焔角の戦鬼バル','火','戦士','power',3,165,46,'drop',1,4],
['knight','エイル','氷鎧騎士エイル','絶零の蒼騎士エイル','水','戦士','guard',3,175,38,'drop',1,5],
['unicorn','セレネ','聖角獣セレネ','天穹の聖角神セレネ','光','神獣','revive',6,350,130,'gacha',1,6],
['kitsune','ヤコ','幽狐ヤコ','永夜の九尾神ヤコ','闇','神獣','drain',6,320,155,'gacha',1,7],
['wyvern','ライカ','雷翼竜ライカ','轟天の雷皇竜ライカ','光','ドラゴン','pierce',5,270,115,'gacha',1,8],
['turtle','トト','潮甲竜トト','蒼穹の玄海竜トト','水','ドラゴン','guard',3,195,30,'drop',1,9],
['scorpion','アンバー','砂甲蠍アンバー','黄昏の蠍帝アンバー','火','獣','pierce',3,135,44,'drop',1,10],
['griffin','ソル','陽翼獣ソル','燦天の陽翼神ソル','光','神獣','power',6,360,150,'gacha',1,11]
];
const KIND_INFO={power:{name:'烈破の一撃',text:'この完了攻撃を2.2倍にする',cd:3},heal:{name:'命の奔流',text:'HP45%回復しながら攻撃',cd:2},guard:{name:'守護の障壁',text:'次の敵の攻撃を75%軽減',cd:2},pierce:{name:'貫通の閃光',text:'敵の盾を無視して1.6倍攻撃',cd:2},drain:{name:'魂の吸収',text:'与えたダメージの25%を回復',cd:2},revive:{name:'不死の祝福',text:'HP35%回復し、次の致死攻撃をHP1で耐える',cd:3}};
const CREATURES=FAMILY_ROWS.map((r,i)=>{const[id,...rest]=r;const [baby,adult,final,element,type,kind,rarity,hp,attack,origin,sheet,family]=rest;return{id,index:i,names:[baby,adult,final],name:baby,element,type,kind,rarity,hp,attack,atk:attack/30,origin,sheet,family,color:ELEMENTS[element].color,...{skill:KIND_INFO[kind].name,cd:KIND_INFO[kind].cd},leader:kind==='guard'?'チームHP +25%':kind==='heal'||kind==='revive'?'課題達成時にHP8%回復':element+'属性の攻撃力 +35%'}});
const MATERIALS=[{id:'seed',name:'命の芽',color:'#a3dd91',icon:'✤',source:'翡翠の森・道中'},{id:'scale',name:'竜の鱗',color:'#e9b677',icon:'◈',source:'各地域のボス'},{id:'crest',name:'虹の紋章',color:'#e4b8f1',icon:'✥',source:'上級・降臨ボス'},{id:'forest-core',name:'翠冠竜の核',color:'#91dda0',icon:'⬡',source:'翠冠竜 降臨'},{id:'volcano-core',name:'焔帝竜の核',color:'#ff9b73',icon:'⬡',source:'焔帝竜 降臨'},{id:'glacier-core',name:'氷海竜の核',color:'#8fd9ef',icon:'⬡',source:'氷海竜 降臨'},{id:'sanctum-core',name:'星獣王の核',color:'#f9df91',icon:'⬡',source:'星獣王 降臨'},{id:'abyss-core',name:'冥月王の核',color:'#c49bea',icon:'⬡',source:'冥月王 降臨'},...Object.entries(ELEMENTS).map(([name,v])=>({id:v.key+'-gem',name:name+'の晶石',color:v.color,icon:'◆',source:name+'属性のダンジョン'}))];
const REGIONS=[{id:'forest',name:'翡翠の森',sub:'芽と木の晶石を集める',element:'木',rank:1,power:1,background:0,enemies:['mushroom','golem','leaf'],drops:['mushroom','golem','owl'],core:'forest-core'},{id:'volcano',name:'紅蓮の火山',sub:'火の晶石と戦士の卵',element:'火',rank:2,power:1.55,background:1,enemies:['salamander','minotaur','fire'],drops:['salamander','minotaur','scorpion'],core:'volcano-core'},{id:'glacier',name:'星霜の氷宮',sub:'水の晶石と海の仲間',element:'水',rank:3,power:2.15,background:2,enemies:['seal','knight','water'],drops:['seal','mermaid','knight','turtle'],core:'glacier-core'},{id:'sanctum',name:'天穹の聖域',sub:'光の晶石と黄金の機兵',element:'光',rank:4,power:3.1,background:0,enemies:['rabbit','beetle','sun'],drops:['rabbit','beetle'],core:'sanctum-core'},{id:'abyss',name:'冥月の遺跡',sub:'闇の晶石と夜の魔物',element:'闇',rank:5,power:4.2,background:2,enemies:['bat','scorpion','moon'],drops:['bat','owl'],core:'abyss-core'}].map(d=>({...d,color:ELEMENTS[d.element].color}));
const elementAdvantage=(attack,defend)=>({火:'木',木:'水',水:'火',光:'闇',闇:'光'}[attack]===defend?1.5:({火:'水',木:'火',水:'木'}[attack]===defend?.7:1));
