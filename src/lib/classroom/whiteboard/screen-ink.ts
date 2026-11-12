/** A pen stroke expressed relative to the captured image, independent of DPI. */
export type ScreenInkStroke = { points: readonly { x: number; y: number }[]; color: string; width: number; aspect: number };

/** Local development can share an asset with another browser on this machine. */
export function isScreenInkUrlAllowed(url: URL, development = process.env.NODE_ENV !== "production") {
  return !url.username && !url.password && (url.protocol === "https:" || (development && url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")));
}

/** Calculate the tightly cropped scene region used for a transparent stroke. */
export function screenInkRegion(stroke: ScreenInkStroke) {
  if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 1 || stroke.points.length > 2048 ||
      !/^#[0-9a-f]{6}$/i.test(stroke.color) || !Number.isFinite(stroke.width) || stroke.width < 0.0005 || stroke.width > 0.05 ||
      !Number.isFinite(stroke.aspect) || stroke.aspect < 0.25 || stroke.aspect > 4 ||
      stroke.points.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return null;
  const points=stroke.points.map(point=>({x:point.x*1280,y:point.y*1280*stroke.aspect}));
  const padding=stroke.width*1280;
  const left=Math.max(0,Math.min(...points.map(point=>point.x))-padding),top=Math.max(0,Math.min(...points.map(point=>point.y))-padding);
  const right=Math.min(1280,Math.max(...points.map(point=>point.x))+padding),bottom=Math.min(1280*stroke.aspect,Math.max(...points.map(point=>point.y))+padding);
  return {points,left,top,width:right-left,height:bottom-top,strokeWidth:stroke.width*1280,centerX:(left+right)/2-640,centerY:(top+bottom)/2-640*stroke.aspect};
}
