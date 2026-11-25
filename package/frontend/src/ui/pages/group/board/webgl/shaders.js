// Positions and distances stay in board units; antialiasing always covers one framebuffer pixel.
const edges = `
uniform float u_pixel;
float box(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}
float fill(float d) { return clamp(0.5 - d / u_pixel, 0.0, 1.0); }
vec4 paint(vec4 color, float coverage) {
  float a = color.a * coverage;
  return vec4(color.rgb * a, a);
}
vec4 over(vec4 top, vec4 base) { return top + (1.0 - top.a) * base; }
`;

export const regionVertex = `
attribute vec2 a_corner;
uniform vec4 u_rect;
uniform vec2 u_projection;
uniform float u_padding;
varying vec2 v_at;
void main() {
  v_at = a_corner * (u_rect.zw + 2.0 * u_padding) - u_padding;
  gl_Position = vec4((u_rect.xy + v_at) * u_projection, 0.0, 1.0);
}`;

export const regionFragment = `
precision highp float;
varying vec2 v_at;
uniform vec4 u_rect, u_base, u_tint, u_stroke, u_halo, u_shadow;
uniform vec4 u_shape; // radius, stroke width, halo width, shadow blur
uniform vec3 u_detail; // dash length, opacity, shadow vertical offset
${edges}
void main() {
  vec2 h = u_rect.zw * 0.5, p = v_at - h;
  float radius = min(u_shape.x, min(h.x, h.y));
  float d = box(p, h, radius);
  float shadowD = box(p - vec2(0, u_detail.z), h, radius);
  float shadow = 1.0 - smoothstep(-u_shape.w, max(0.1, u_shape.w), shadowD);
  vec4 outColor = paint(u_shadow, shadow);
  outColor = over(paint(u_halo, fill(d - u_shape.z)), outColor);
  vec4 body = over(paint(u_tint, clamp(1.0 - v_at.y / 52.0, 0.0, 1.0)), paint(u_base, 1.0));
  float stroke = 1.0 - fill(d + u_shape.y);
  if (u_detail.x > 0.0) {
    // Measure dashes along each straight edge, then around the intervening quarter-circle.
    vec2 inner = h - radius;
    vec2 q = abs(p) - inner;
    float arc = radius * 1.57079633;
    float along;
    if (q.x > 0.0 && q.y > 0.0) along = inner.x + radius * atan(q.x, q.y);
    else if (q.y > q.x) along = abs(p.x);
    else along = inner.x + arc + inner.y - abs(p.y);
    stroke *= smoothstep(0.0, u_pixel, mod(along, u_detail.x * 2.0))
            * (1.0 - smoothstep(u_detail.x, u_detail.x + u_pixel, mod(along, u_detail.x * 2.0)));
  }
  body = over(paint(u_stroke, stroke), body) * fill(d);
  gl_FragColor = over(body, outColor) * u_detail.y;
}`;

export const cardVertex = `
attribute vec4 a_point, a_surface, a_color, a_state, a_image;
attribute vec2 a_corner;
uniform vec2 u_projection;
uniform vec4 u_frame;
varying vec4 v_at, v_surface, v_color, v_state, v_image;
varying float v_toneAlpha;
void main() {
  vec2 local = (a_corner * 2.0 - 1.0) * a_point.z;
  vec2 world = a_point.xy + local;
  v_at = vec4(local, world - u_frame.xy);
  v_toneAlpha = a_point.w;
  v_surface = a_surface; v_color = a_color; v_state = a_state; v_image = a_image;
  gl_Position = vec4(world * u_projection, 0.0, 1.0);
}`;

export const cardFragment = `
precision highp float;
varying vec4 v_at, v_surface, v_color, v_state, v_image;
varying float v_toneAlpha;
uniform vec4 u_star, u_starSoft, u_frame;
uniform vec2 u_crop;
uniform float u_far, u_dark;
uniform sampler2D u_texture;
${edges}
bool flag(float bit) { return mod(floor(v_state.x / bit), 2.0) > 0.5; }
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 v = b-a;
  return length(p - a - v * clamp(dot(p-a,v) / dot(v,v),0.0,1.0));
}
vec4 badge(vec2 p, bool play, bool mainCover) {
  float d = box(p,vec2(9),4.0);
  vec4 bg = mainCover ? vec4(.941,.816,.471,.94) : vec4(.047,.071,.149,.5);
  vec3 ink = mainCover ? vec3(.165,.141,.094) : vec3(.953,.843,.494);
  float glyph;
  if (play) {
    glyph = max(-p.x-1.85, (p.x+abs(p.y)*1.56-3.4)*.54);
    ink = vec3(.984,.969,.933);
  } else {
    float frame = abs(box(p,vec2(4.25,3.75),1.1)) - .45;
    float mountain = min(segment(p,vec2(-4.1,2.3),vec2(-1.3,.1)),
                         segment(p,vec2(-1.3,.1),vec2(1.9,3.3))) - .45;
    float star = abs(p.x-1.8)+abs(p.y+1.3)-1.15;
    glyph = min(frame,min(star,mountain));
  }
  return over(paint(vec4(ink,1),fill(glyph)),paint(bg,fill(d)));
}
void main() {
  float clip = 1.0;
  if (u_crop.x + u_crop.y > 0.0) {
    vec2 h = u_frame.zw * 0.5;
    clip *= fill(box(v_at.zw-h, h, min(16.0, min(h.x,h.y))));
    vec2 fade = clamp((u_frame.zw - v_at.zw - 10.0) / 48.0, 0.0, 1.0);
    clip *= mix(1.0,fade.x,u_crop.x) * mix(1.0,fade.y,u_crop.y);
  }
  bool selected = flag(1.0), preview = flag(2.0), lit = flag(4.0), hot = flag(8.0);
  vec2 p = v_at.xy;
  float c = cos(v_surface.y), s = sin(v_surface.y);
  mat2 unrotate = mat2(c,-s,s,c);
  vec4 well = vec4(0);
  if (selected || preview) {
    bool swatch = selected && u_far > .5;
    float d = box(selected ? unrotate * p : p, vec2(swatch ? 38.0 : 37.0), swatch ? 6.0 : 9.0);
    well = paint(u_star,fill(d - (swatch ? 0.0 : 1.5)) * (preview ? (selected ? .5 : .7) : 1.0));
    if (!swatch) well = well * (1.0-fill(d)) + (selected ? paint(u_starSoft,fill(d)) : vec4(0));
  }
  float scale = v_surface.x;
  vec2 q = (unrotate * p - vec2(0,v_surface.z)) / scale;
  float radius = selected ? (u_far > .5 ? 3.0 : 5.0) : 7.0;
  float d = box(q, vec2(38), radius);
  float shadowOffset = hot ? 4.0 : selected ? 2.0 : 1.0;
  float shadowBlur = hot ? 7.0 : selected ? 4.0 : 1.5;
  float sd = box(q-vec2(0,shadowOffset),vec2(38),radius);
  vec4 face = paint(vec4(.118,.094,.055,hot ? .23 : selected ? .19 : .08),
      (1.0-smoothstep(-shadowBlur,shadowBlur,sd)) * (u_dark > .5 && !hot && !selected ? 0.0 : 1.0));
  face = over(paint(vec4(vec3(u_dark > .5 ? .90 : .10),.06),fill((d-1.0)*scale)),face);
  if (lit || v_state.w > 0.0) {
    float glow = lit ? 1.0 : v_state.w;
    face = over(paint(lit ? u_star : u_starSoft,glow * (lit ? .38 : 1.0) * (1.0-smoothstep(2.0,12.0,d))),face);
    face = over(paint(u_star,glow*fill((d-2.5)*scale)),face);
  }
  vec4 picture = paint(vec4(v_color.rgb,v_toneAlpha),1.0);
  if (v_image.w > 0.0) {
    vec2 uv = v_image.xy + clamp(q/76.0+.5,0.0,1.0)*v_image.z;
    picture = over(texture2D(u_texture,uv)*v_image.w,picture);
  }
  if (flag(16.0)) picture = over(badge(q-vec2(-25,25),true,false),picture);
  if (flag(32.0)) picture = over(badge(q-vec2(25,25),false,flag(64.0)),picture);
  picture.rgb = mix(vec3(dot(picture.rgb,vec3(.213,.715,.072))),picture.rgb,v_color.a);
  face = over(picture * fill(d*scale),face) * v_state.y * v_surface.w;
  gl_FragColor = over(face,well) * v_state.z * clip;
}`;
