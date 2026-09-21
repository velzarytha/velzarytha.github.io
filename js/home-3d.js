(function(){
'use strict';
var canvas=document.getElementById('webgl');
var gl=canvas&&canvas.getContext('webgl',{antialias:true,alpha:false});
if(!gl)return;

var vs='attribute vec3 p;attribute vec3 c;uniform mat4 mvp;varying vec3 vc;void main(){gl_Position=mvp*vec4(p,1.0);vc=c;}';
var fs='precision mediump float;varying vec3 vc;void main(){gl_FragColor=vec4(vc,0.97);}';
function shader(type,src){var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return s;}
var prog=gl.createProgram(),sv=shader(gl.VERTEX_SHADER,vs),sf=shader(gl.FRAGMENT_SHADER,fs);
gl.attachShader(prog,sv);gl.attachShader(prog,sf);gl.linkProgram(prog);gl.useProgram(prog);
var locP=gl.getAttribLocation(prog,'p'),locC=gl.getAttribLocation(prog,'c'),locM=gl.getUniformLocation(prog,'mvp');
function buf(data){var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return b;}
function matMul(a,b){var o=new Float32Array(16);for(var c=0;c<4;c++)for(var r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function perspective(fov,asp,n,f){var t=1/Math.tan(fov/2),q=1/(n-f);return new Float32Array([t/asp,0,0,0,0,t,0,0,0,0,(f+n)*q,-1,0,0,2*f*n*q,0]);}
function rotX(a){var c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);}
function rotY(a){var c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);}
function rotZ(a){var c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,0,1,0,0,0,1]);}
function trans(x,y,z){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);}
function scale(x,y,z){return new Float32Array([x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1]);}

var P=[],C=[];
function tri(a,b,c,ca,cb,cc){P.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);C.push(ca[0],ca[1],ca[2],cb[0],cb[1],cb[2],cc[0],cc[1],cc[2]);}
function quad(a,b,c,d,ca,cb,cc,cd){tri(a,b,c,ca,cb,cc);tri(a,c,d,ca,cc,cd);}

// Build a true crystal V from two thick diagonal arms.
function addArm(cx,cy,angle,len,width,z,depth,colors){
  var ux=Math.cos(angle),uy=Math.sin(angle),vx=-uy,vy=ux;
  var a=[cx-ux*len/2-vx*width/2,cy-uy*len/2-vy*width/2,z+depth/2];
  var b=[cx+ux*len/2-vx*width/2,cy+uy*len/2-vy*width/2,z+depth/2];
  var c=[cx+ux*len/2+vx*width/2,cy+uy*len/2+vy*width/2,z+depth/2];
  var d=[cx-ux*len/2+vx*width/2,cy-uy*len/2+vy*width/2,z+depth/2];
  var A=[a[0],a[1],z-depth/2],B=[b[0],b[1],z-depth/2],C0=[c[0],c[1],z-depth/2],D=[d[0],d[1],z-depth/2];
  quad(a,b,c,d,colors[0],colors[1],colors[2],colors[3]);
  quad(D,C0,B,A,colors[4],colors[5],colors[6],colors[7]);
  quad(a,d,D,A,colors[8],colors[8],colors[9],colors[9]);
  quad(b,B,C0,c,colors[1],colors[1],colors[2],colors[2]);
  quad(d,c,C0,D,colors[3],colors[3],colors[5],colors[5]);
  quad(a,A,B,b,colors[0],colors[0],colors[4],colors[4]);
}
var leftCols=[[.18,.78,1],[.25,.55,1],[.48,.38,1],[.20,.70,1],[.12,.42,.92],[.25,.48,.95],[.48,.28,.88],[.15,.56,.95],[.22,.65,1],[.40,.42,1]];
var rightCols=[[.28,.70,1],[.38,.48,1],[.68,.30,1],[.35,.60,1],[.18,.40,.90],[.34,.38,.94],[.64,.25,.86],[.20,.50,.95],[.30,.58,1],[.50,.36,1]];
// Arms meet at the bottom, forming a clear V.
addArm(-.64,.08, -1.05, 2.75,.62,.0,.42,leftCols);
addArm(.64,.08, -2.09, 2.75,.62,.0,.42,rightCols);
var vb=buf(P),cb=buf(C);

// Crisp crystal edge accents.
var edgeP=[],edgeC=[];
function edge(a,b){edgeP.push(a[0],a[1],a[2],b[0],b[1],b[2]);edgeC.push(.35,.85,1,.58,.42,1);}
var edges=[
 [[-1.70,.96,.22],[-1.42,.43,.22]], [[-1.42,.43,.22],[-.25,-1.15,.22]],
 [[.25,-1.15,.22],[1.42,.43,.22]], [[1.42,.43,.22],[1.70,.96,.22]],
 [[-1.70,.96,.22],[-.98,1.30,.22]], [[.98,1.30,.22],[1.70,.96,.22]]
]; edges.forEach(function(e){edge(e[0],e[1]);});
var eb=buf(edgeP),ecb=buf(edgeC);

// Soft orbital accents: only three restrained rings.
var ringP=[],ringC=[];
for(var r=0;r<3;r++){var rad=1.78+r*.28,seg=160;for(var j=0;j<seg;j++){var a=j*Math.PI*2/seg,b=(j+1)*Math.PI*2/seg;ringP.push(Math.cos(a)*rad,(r-1)*.10+Math.sin(a)*.05,Math.sin(a)*rad,Math.cos(b)*rad,(r-1)*.10+Math.sin(b)*.05,Math.sin(b)*rad);ringC.push(.38,.66,1,.48,.38,1);}}
var rb=buf(ringP),rcb=buf(ringC);

// Small ambient particles.
var starP=[],starC=[];for(var i=0;i<430;i++){var x=(Math.random()-.5)*18,y=(Math.random()-.5)*10,z=(Math.random()-.5)*16;starP.push(x,y,z);starC.push(.48+Math.random()*.30,.70+Math.random()*.25,1);}
var sb=buf(starP),scb=buf(starC);

var mx=0,my=0,tx=0,ty=0;
addEventListener('pointermove',function(e){tx=e.clientX/innerWidth-.5;ty=e.clientY/innerHeight-.5;});
function resize(){var d=Math.min(devicePixelRatio||1,2);canvas.width=innerWidth*d;canvas.height=innerHeight*d;gl.viewport(0,0,canvas.width,canvas.height);}addEventListener('resize',resize);resize();
gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.lineWidth(1.1);
function bind(bc,cc){gl.bindBuffer(gl.ARRAY_BUFFER,bc);gl.enableVertexAttribArray(locP);gl.vertexAttribPointer(locP,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,cc);gl.enableVertexAttribArray(locC);gl.vertexAttribPointer(locC,3,gl.FLOAT,false,0,0);}
function draw(ms){requestAnimationFrame(draw);var t=ms*.001;mx+=(tx-mx)*.035;my+=(ty-my)*.035;
  gl.clearColor(.91,.965,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  var asp=canvas.width/canvas.height,Pm=perspective(Math.PI/3,asp,.1,60);
  bind(sb,scb);gl.uniformMatrix4fv(locM,false,matMul(Pm,matMul(rotY(t*.004),trans(-mx*.18,-my*.10,-12))));gl.drawArrays(gl.POINTS,0,starP.length/3);
  var x=2.48+mx*.26,y=.10-my*.12,z=-5.35;
  var base=matMul(trans(x,y,z),matMul(rotY(mx*.20),rotX(-.06+my*.10)));
  // gentle luminous shell
  bind(vb,cb);gl.uniformMatrix4fv(locM,false,matMul(Pm,matMul(base,scale(.94,.94,.94))));gl.drawArrays(gl.TRIANGLES,0,P.length/3);
  gl.uniformMatrix4fv(locM,false,matMul(Pm,matMul(base,scale(.94,.94,.94))));gl.drawArrays(gl.TRIANGLES,0,P.length/3);
  bind(eb,ecb);gl.uniformMatrix4fv(locM,false,matMul(Pm,matMul(base,scale(.95,.95,.95))));gl.drawArrays(gl.LINES,0,edgeP.length/3);
  var rings=matMul(trans(x,y,z-.04),matMul(rotY(t*.018+mx*.10),rotX(.76+my*.08)));bind(rb,rcb);gl.uniformMatrix4fv(locM,false,matMul(Pm,rings));gl.drawArrays(gl.LINES,0,ringP.length/3);
}
requestAnimationFrame(draw);
})();
