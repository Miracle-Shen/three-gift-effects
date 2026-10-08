/**
 * 全部 GLSL。
 *
 * 约定：
 * - 守护鹿亮点使用 NormalBlending 限制重叠亮度；柔光层、送礼路径使用
 *   AdditiveBlending（SRC_ALPHA, ONE）。颜色均不预乘 alpha。
 * - 深度：depthTest: true / depthWrite: false —— 这是需求文档 4.1「深度穿透」的正解。
 *   严禁用 ZTest Always；那会让粒子永远压在最前面，退化成贴在屏幕上的一张图。
 * - 安全区降亮在 projectPoint() 里统一处理，两个效果共用。
 */

const COMMON = `
  uniform float uTime,uOpacity,uPixelScale,uPerspective,uGlow,uPointGain;
  uniform vec3 uGold,uIvory,uSafeCenter,uSafeHalf;
  varying vec3 vColor;varying float vAlpha,vGlint;
  const float PI=3.14159265359;const float TAU=6.28318530718;
  float hash(float x){return fract(sin(x*127.1)*43758.5453);}
  vec3 noise3(float x){return vec3(hash(x),hash(x+7.13),hash(x+19.7))-.5;}
  void projectPoint(vec3 p,float size){
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    gl_PointSize=clamp(size*uPointGain*uPixelScale/mix(1.,max(.1,-mv.z),uPerspective),1.2,30.);
    vec3 gap=abs(p-uSafeCenter)-uSafeHalf;
    if(max(max(gap.x,gap.y),gap.z)<0.)vAlpha*=.25;
  }
`;

export const POINT_FRAGMENT = `
  varying vec3 vColor;varying float vAlpha,vGlint;
  void main(){
    vec2 q=gl_PointCoord*2.-1.;float r2=dot(q,q);if(r2>1.)discard;
    float core=exp(-r2*19.);float halo=exp(-r2*4.5)*.20;
    float star=(exp(-abs(q.x)*48.)+exp(-abs(q.y)*48.))*pow(max(0.,1.-sqrt(r2)),2.)*.46*vGlint;
    // AdditiveBlending applies alpha. Premultiplying here would dim it twice.
    gl_FragColor=vec4(vColor,(core+halo+star)*vAlpha);
  }
`;

const BONES = `
  uniform mat4 uBones[6];attribute float aBone,aBoneMix;
  mat4 boneMatrix(){int b=int(aBone+.5);mat4 m=uBones[0];for(int i=0;i<6;i++){if(i==b)m=uBones[i];}return uBones[0]*(1.-aBoneMix)+m*aBoneMix;}
`;

// A round warm emitter with a broad, low-energy halo. No white cross sprites.
// Output conversion is also needed when the host renders without an OutputPass.
export const DEER_FRAGMENT = `
  varying vec3 vColor;varying float vAlpha,vGlint;
  void main(){
    vec2 q=gl_PointCoord*2.-1.;float r2=dot(q,q);if(r2>1.)discard;
    float core=exp(-r2*13.),halo=exp(-r2*3.4)*.13;
    gl_FragColor=vec4(vColor,(core+halo)*vAlpha);
    #include <colorspace_fragment>
  }
`;

export const DEER_HALO_FRAGMENT = `
  varying vec3 vColor;varying float vAlpha,vGlint;
  void main(){
    vec2 q=gl_PointCoord*2.-1.;float r2=dot(q,q);if(r2>1.)discard;
    gl_FragColor=vec4(vColor,exp(-r2*4.5)*(1.-r2)*vAlpha);
    #include <colorspace_fragment>
  }
`;

export const DEER_VERTEX = COMMON + BONES + `
  attribute vec4 aData;uniform float uForm,uDissolve,uDensity,uNoise,uModelScale;
  uniform vec3 uOrigin;
  void main(){
    mat4 bone=boneMatrix();vec3 target=(bone*vec4(position,1.)).xyz;
    float k=smoothstep(aData.x*.42,1.,uForm);
    float angle=aData.y*TAU+uTime*(.6+aData.z);
    vec3 source=uOrigin+vec3(cos(angle)*(1.8+aData.w*4.),aData.z*.8,sin(angle)*(1.5+aData.w*2.));
    vec3 p=mix(source,target,k);
    p+=vec3(sin(angle*2.),sin(PI*k)*2.4,cos(angle*2.))*(1.-k)*k;
    p+=noise3(aData.y*192.)*uNoise;
    p+=noise3(aData.z*613.)*uDissolve*4.+vec3(0.,uDissolve*(1.+aData.x*3.),0.);
    vec3 normalWorld=normalize(mat3(modelMatrix)*mat3(bone)*normal);
    vec3 viewDirection=normalize(cameraPosition-(modelMatrix*vec4(target,1.)).xyz);
    float facing=dot(normalWorld,viewDirection),rim=pow(1.-abs(facing),3.);
    float twinkle=.86+.14*sin(uTime*(1.2+aData.w*1.6)+aData.x*60.);
    vGlint=step(.992,aData.w);
    vColor=mix(uGold,uIvory,.38+aData.z*.56)*uGlow*(.93+vGlint*.07);
    float sideLight=mix(.23,1.20,smoothstep(-.25,.15,facing));
    vAlpha=uOpacity*(sideLight+rim*.14)*twinkle*min(uDensity,1.25)*(1.-uDissolve);
    projectPoint(p,(mix(.067,.100,aData.y)+vGlint*.044)*uModelScale);
  }
`;

export const AURA_VERTEX = COMMON + `
  attribute vec4 aData;uniform mat4 uRoot;uniform float uDissolve,uModelScale;
  void main(){
    float role=aData.x;vec3 p;float size;
    if(role<.88){
      float f=role/.88,angle=mix(1.22,-2.25,f);
      float spread=.09+pow(aData.z,.8)*.48;
      float swirl=sin(f*38.-uTime*.7+aData.y*TAU)*.018;
      p=vec3(1.91+cos(angle)*2.45,1.94+sin(angle)*1.89,-.13+sin(angle)*.25);
      p+=noise3(aData.w*271.)*spread+vec3(swirl,swirl*.4,0.);
      vAlpha=uOpacity*(.47+aData.z*.48)*smoothstep(0.,.10,f)*(1.-smoothstep(.89,1.,f));
      size=.056+aData.w*.050;vGlint=step(.988,aData.w);
    }else{
      float a=aData.y*TAU+uTime*.035,y=mod(aData.z*3.8+uTime*.04,3.8);
      p=vec3(1.3+cos(a)*(1.9+aData.w*.7),y,sin(a)*.5);
      vAlpha=uOpacity*sin(y/3.8*PI)*(.22+aData.w*.40);size=.056+aData.w*.07;vGlint=step(.97,aData.w);
    }
    p+=(noise3(aData.y*378.)+vec3(0.,1.,0.))*uDissolve*1.8;p=(uRoot*vec4(p,1.)).xyz;
    vAlpha*=1.-uDissolve;vColor=mix(uGold,uIvory,.30+aData.w*.68)*uGlow*(.95+vGlint*.05);projectPoint(p,size*uModelScale);
  }
`;

const PATH_FUNCTION = `
  uniform vec3 uStart,uEnd;
  vec3 path(float t){vec3 p=mix(uStart,uEnd,t);p.x-=sin(t*6.28318530718)*3.35;p.y+=sin(t*3.14159265359)*1.3;return p;}
`;

export const PATH_VERTEX = COMMON + PATH_FUNCTION + `
  attribute vec4 aData;uniform float uTravel,uArrival,uDissolve;
  void main(){
    float t=aData.x,head=uTravel,released=smoothstep(t-.018,t+.01,head);vec3 center=path(t);
    vec3 tangent=normalize(path(min(1.,t+.003))-path(max(0.,t-.003)));
    vec3 side=normalize(cross(tangent,vec3(0.,1.,0.))),up=normalize(cross(side,tangent));
    float angle=aData.y*TAU+t*22.-uTime*2.,radius=(.022+pow(aData.z,3.)*.27)*(1.-.7*uArrival);
    vec3 p=center+(side*cos(angle)+up*sin(angle))*radius;
    p+=noise3(aData.w*124.)*(.1+uDissolve*2.5);p.y+=uDissolve*(.3+aData.w*2.);
    float tail=mix(.22,1.,smoothstep(head-.80,head,t));vGlint=step(.97,aData.w);
    vAlpha=uOpacity*released*tail*(.45+aData.z*.5)*(1.-uDissolve)*mix(1.,.5,uArrival);
    vColor=mix(uGold,uIvory,aData.y)*uGlow*(2.0+vGlint*2.);projectPoint(p,.065+aData.z*.09+vGlint*.19);
  }
`;

export const BURST_VERTEX = COMMON + PATH_FUNCTION + `
  attribute vec4 aData;uniform float uTravel,uArrival,uDissolve;
  void main(){
    float angle=aData.x*TAU;vec3 p;float a;
    if(aData.w<.5){
      float flight=fract(aData.z+uTime*.27),t=clamp(uTravel-flight*.24,0.,1.);
      p=path(t)+noise3(aData.y*367.)*flight*.75;a=(1.-flight)*(.45+.55*(1.-uArrival));
    }else{
      float ring=1.+uArrival*.6;p=uEnd+vec3(cos(angle)*ring,sin(angle)*ring*.88,-sin(angle)*ring*.48);
      p+=noise3(aData.z*170.)*(.05+uArrival*.21);a=uArrival*(.28+pow(aData.z,4.)*.6);
    }
    p.y+=uDissolve*(.3+aData.y*1.6);vAlpha=a*uOpacity*(1.-uDissolve);vGlint=step(.93,aData.y);
    vColor=mix(uGold,uIvory,.3+aData.z*.7)*uGlow*(2.+vGlint*2.);projectPoint(p,.055+aData.y*.18);
  }
`;

/* 注意：这里**没有**沿曲线扫出的 ribbon 光带。
   它曾经把宿主后期链（UnrealBloom + MSAA composer）推成整屏纯黑，
   详见 effects/path.js 里的说明与 README「已知问题」。 */

const LEAF_DEFORM = `
  uniform float uTime,uFlap;
  vec3 leaf(vec3 p){float angle=sin(uTime*5.2)*uFlap;float x=p.x;p.x=x*cos(angle);p.z+=abs(x)*sin(angle)+sin(p.y*4.+uTime*2.)*.025;return p;}
`;

export const LEAF_VERTEX = COMMON + LEAF_DEFORM.replace('uniform float uTime,uFlap;', 'uniform float uFlap;') + `
  attribute vec4 aData;void main(){vec3 p=leaf(position);vGlint=step(.96,aData.w);vColor=mix(uGold,uIvory,.8)*uGlow*2.7;vAlpha=uOpacity*(.65+aData.z*.35);
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((.055+vGlint*.14)*uPixelScale/mix(1.,max(.1,-mv.z),uPerspective),1.25,18.);}
`;

export const LEAF_SURFACE_VERTEX = LEAF_DEFORM + `
  varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(leaf(position),1.);}
`;

export const LEAF_SURFACE_FRAGMENT = `
  uniform float uOpacity,uGlow;uniform vec3 uGold,uIvory;varying vec2 vUv;
  void main(){float edge=pow(abs(vUv.y),4.);gl_FragColor=vec4(mix(uGold,uIvory,edge*.7)*uGlow,uOpacity*(.12+edge*.16));}
`;
