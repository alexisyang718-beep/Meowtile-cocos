import fs from 'fs';
import path from 'path';

const WANTED_MIN_SDK = 23;

function patchGradleProperties(buildDest) {
  const gp = path.join(buildDest, 'proj', 'gradle.properties');
  if (!fs.existsSync(gp)) {
    console.log(`[android-minsdk] 未找到 ${gp}，跳过`);
    return;
  }
  const content = fs.readFileSync(gp, 'utf8');
  const m = content.match(/^PROP_MIN_SDK_VERSION=(\d+)/m);
  if (!m) {
    console.log(`[android-minsdk] gradle.properties 中未找到 PROP_MIN_SDK_VERSION，跳过`);
    return;
  }
  if (parseInt(m[1], 10) >= WANTED_MIN_SDK) {
    console.log(`[android-minsdk] minSdk 已是 ${m[1]}，无需处理`);
    return;
  }
  const next = content.replace(
    /^PROP_MIN_SDK_VERSION=\d+/m,
    `PROP_MIN_SDK_VERSION=${WANTED_MIN_SDK}`
  );
  fs.writeFileSync(gp, next);
  console.log(`[android-minsdk] 已将 minSdk ${m[1]} -> ${WANTED_MIN_SDK}（${gp}）`);
}

// 生成原生工程（make）之后、编译（生成）之前触发，正好赶在 gradle 编译前生效
export function onAfterMake(options, result) {
  try {
    if (options.platform !== 'android') return;
    patchGradleProperties(options.dest);
  } catch (e) {
    console.error('[android-minsdk] 处理失败:', e);
  }
}

export function load() {}
export function unload() {}
