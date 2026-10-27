# 미터기 본체 이미지

- 생성 방식: 내장 image_gen 도구, 신규 이미지 생성, 불투명 배경.
- 프로젝트에서 사용하는 최종 파일: assets/taxi-meter-body-v2.jpg (851 × 1848).
- 원본: 내장 이미지 생성 결과 exec-8ba3e9d4-6587-4403-a3f2-d6a5e2e7ad44.png
- 배포용 파일은 원본의 구도나 내용을 바꾸지 않고 JPEG 품질 84로 변환했다.
- 글자와 숫자가 없는 본체 배경이다. 금액, 상태, 표시등, 버튼은 실제 운행 데이터와 연결된 HTML/SVG이며 정지하면 운행 애니메이션도 정지한다. 움직임 줄이기 설정을 존중한다.

## 사용한 최종 프롬프트

```
Use case: product-mockup. Asset type: production background texture for a fully functional Korean taxi meter mobile web app, portrait aspect ratio 9:19.5, high resolution. Create a photorealistic, straight-on orthographic close-up of an unbranded Korean taxi fare meter control console. The entire portrait image IS the physical device faceplate: matte charcoal black molded polymer with subtle brushed grain, realistic shallow bevels, tiny recessed screws near the four corners, very restrained wear, soft realistic top-left illumination. Edge-to-edge enclosure, not an object placed against a scene; no surrounding dashboard, no car, no desk, no floating product, no thick empty outside margins. Composition intended for exact HTML overlays: a completely blank deep-black smoked-glass main display recess spanning x=6% to94%, y=10% to48%; a subtle horizontal brushed-metal divider; a second blank smoked-glass rectangular display recess spanning x=6% to94%, y=51% to65%; two unlabelled gently raised rectangular charcoal physical button caps side by side at x=7%..48% and x=52%..93%, y=73%..84%; a shallow empty indicator rail at y=88%..93%. Keep all display interiors perfectly dark and empty so live amber LED numbers can be composited by code. Keep the middle of both button caps blank for Korean HTML labels. High-end realistic industrial hardware, tactile plastic and glass, natural shadows, clear geometric rectangles, restrained realism, absolutely no decorative fantasy. CRITICAL: no text whatsoever, no letters, no English, no Korean, no numbers, no logos, no brand, no watermarks, no glowing digits or baked-in UI.
```
