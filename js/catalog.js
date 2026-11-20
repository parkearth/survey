// Default component dimensions are editable drafting starting points, in centimetres.
export const constructionTypes = {
  RC: {
    label: '鋼筋混凝土 RC',
    thickness: 15
  },
  SRC: {
    label: '鋼骨鋼筋混凝土 SRC',
    thickness: 20
  },
  SC: {
    label: '鋼骨造 SC',
    thickness: 15
  },
  masonry: {
    label: '磚石造',
    thickness: 24
  },
  wood: {
    label: '木造',
    thickness: 12
  },
  lightSteel: {
    label: '輕鋼架／鐵皮造',
    thickness: 10
  }
};
export const groups = {
  structure: '結構與牆體',
  envelope: '門窗與開口',
  circulation: '樓梯與電梯',
  outdoor: '陽台與屋頂',
  plumbing: '廚衛與設備',
  furniture: '家具與收納'
};
// key, label, group, representation, width, depth, height
const entries = [['structural', '外牆', 'structure', 'wall', 300, 15, 280], ['partition', '隔間牆', 'structure', 'wall', 200, 10, 280], ['column', '矩形柱', 'structure', 'component', 40, 40, 280], ['beam', '梁', 'structure', 'component', 300, 30, 45], ['slab', '樓板', 'structure', 'component', 300, 300, 15], ['door', '單扇門', 'envelope', 'opening', 90, 12, 210], ['double_door', '雙扇門', 'envelope', 'opening', 160, 12, 210], ['sliding_door', '橫拉門', 'envelope', 'opening', 180, 12, 210], ['roller_door', '鐵捲門', 'envelope', 'opening', 300, 15, 240], ['passage', '無門開口', 'envelope', 'opening', 120, 12, 210], ['sliding_window', '橫拉窗', 'envelope', 'opening', 120, 12, 120], ['floor_window', '落地窗', 'envelope', 'opening', 180, 12, 240], ['stairs', '直跑樓梯', 'circulation', 'opening', 100, 280, 280], ['stairs_u', '折返樓梯', 'circulation', 'opening', 220, 300, 280], ['elevator', '電梯', 'circulation', 'opening', 160, 160, 240], ['ramp', '坡道', 'circulation', 'component', 120, 300, 30], ['balcony', '陽台／露台', 'outdoor', 'region', 300, 150, 100], ['arcade', '騎樓／車庫', 'outdoor', 'region', 400, 300, 280], ['parapet', '女兒牆', 'outdoor', 'component', 300, 12, 100], ['railing', '欄杆', 'outdoor', 'component', 300, 8, 110], ['canopy', '雨遮', 'outdoor', 'component', 300, 100, 12], ['roof', '平屋頂板', 'outdoor', 'component', 400, 400, 15], ['water_tank', '水箱', 'plumbing', 'component', 120, 120, 150], ['ac_unit', '冷氣室外機', 'plumbing', 'component', 90, 40, 70], ['kitchen_counter', '廚房流理臺', 'plumbing', 'component', 180, 60, 85], ['sink', '洗手臺', 'plumbing', 'component', 60, 50, 80], ['toilet', '馬桶', 'plumbing', 'component', 40, 70, 75], ['bathtub', '浴缸', 'plumbing', 'component', 150, 75, 55], ['shower', '淋浴間', 'plumbing', 'component', 90, 90, 210], ['pipe_shaft', '管道間', 'plumbing', 'component', 60, 60, 280], ['wardrobe', '系統衣櫃', 'furniture', 'furniture', 181, 58, 230], ['shoe_cabinet', '鞋櫃', 'furniture', 'furniture', 100, 35, 100], ['tv_cabinet', '電視櫃', 'furniture', 'furniture', 160, 40, 60], ['sofa_3', '三人沙發', 'furniture', 'furniture', 204, 86, 82], ['sofa_l', 'L 型沙發', 'furniture', 'furniture', 230, 150, 82], ['bed', '雙人床', 'furniture', 'furniture', 150, 188, 52], ['desk', '辦公桌', 'furniture', 'furniture', 140, 70, 75], ['dining_table', '餐桌', 'furniture', 'furniture', 160, 80, 75], ['chair', '椅子', 'furniture', 'furniture', 45, 45, 85]];
export const catalog = Object.fromEntries(entries.map(([key, label, group, kind, width, depth, height]) => [key, {
  key,
  label,
  group,
  kind,
  width,
  depth,
  height
}]));
export const objectGroup = o => catalog[o.subtype || o.category || o.type]?.group || 'structure';
export const objectKey = o => o.subtype || o.category || o.type;

