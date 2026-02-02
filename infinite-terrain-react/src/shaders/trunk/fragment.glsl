varying vec2 vUv;
varying vec3 vWorldPosition;

uniform vec3 uTrunkColorA;
uniform vec3 uTrunkColorB;
uniform vec3 uCircleCenter;
uniform float uChunkSize;
uniform sampler2D uNoiseTexture;
uniform float uNoiseStrength;
uniform float uNoiseScale;
uniform float uCircleRadiusFactor;
uniform float uGrassFadeOffset;
uniform float uBorderTreesMultiplier;
uniform float uPixelSize;
uniform int uDitherMode;

// --- Dither Functions ---
float getDiamondThreshold(vec2 fragCoord, float pixelSize) {
    vec2 uv = mod(fragCoord + 0.01, pixelSize);
    vec2 centered = (uv / pixelSize) * 2.0 - 1.0;
    float dist = abs(centered.x) + abs(centered.y);
    return dist / 2.0;
}

float getBayerThreshold(vec2 fragCoord, float pixelSize) {
    vec2 pixelCoord = floor(fragCoord / pixelSize);
    int x = int(mod(pixelCoord.x, 8.0));
    int y = int(mod(pixelCoord.y, 8.0));

    int M[64];
    M[0]=0;  M[1]=32; M[2]=8;  M[3]=40; M[4]=2;  M[5]=34; M[6]=10; M[7]=42;
    M[8]=48; M[9]=16; M[10]=56;M[11]=24;M[12]=50;M[13]=18;M[14]=58;M[15]=26;
    M[16]=12;M[17]=44;M[18]=4; M[19]=36;M[20]=14;M[21]=46;M[22]=6; M[23]=38;
    M[24]=60;M[25]=28;M[26]=52;M[27]=20;M[28]=62;M[29]=30;M[30]=54;M[31]=22;
    M[32]=3; M[33]=35;M[34]=11;M[35]=43;M[36]=1; M[37]=33;M[38]=9; M[39]=41;
    M[40]=51;M[41]=19;M[42]=59;M[43]=27;M[44]=49;M[45]=17;M[46]=57;M[47]=25;
    M[48]=15;M[49]=47;M[50]=7; M[51]=39;M[52]=13;M[53]=45;M[54]=5; M[55]=37;
    M[56]=63;M[57]=31;M[58]=55;M[59]=23;M[60]=61;M[61]=29;M[62]=53;M[63]=21;

    int index = y * 8 + x;
    return float(M[index]) / 64.0;
}

bool shouldDiscard(vec2 fragCoord, float pixelSize, float fadeLevel, int mode) {
    if (fadeLevel <= 0.0) return false;
    if (fadeLevel >= 1.0) return true;

    float threshold = 0.0;
    if (mode == 0) {
        threshold = getDiamondThreshold(fragCoord, pixelSize + 4.0);
    } else if (mode == 1) {
        threshold = getBayerThreshold(fragCoord, pixelSize);
    }
    return threshold < fadeLevel;
}

void main() {
  float m = step(0.5, vUv.y);
  csm_DiffuseColor.rgb = mix(uTrunkColorA, uTrunkColorB, m);

  vec2 worldXZ = vWorldPosition.xz;
  vec2 circleXZ = uCircleCenter.xz;
  float distToCircle = length(worldXZ - circleXZ) * uBorderTreesMultiplier;

  vec2 noiseUV = worldXZ * uNoiseScale * 0.1;
  float noiseValue = texture2D(uNoiseTexture, noiseUV).r;
  float noiseOffset = (noiseValue * 2.0 - 1.0) * uNoiseStrength;

  float radius = uChunkSize * uCircleRadiusFactor * (1.0 + noiseOffset);
  float fadeMask = 1.0 - smoothstep(radius - uGrassFadeOffset, radius, distToCircle);

  if (fadeMask < 0.99) {
      float fade = 1.0 - fadeMask;
      if (shouldDiscard(gl_FragCoord.xy, uPixelSize, fade, uDitherMode)) {
          discard;
      }
  }
}

