let video;
let handPose;
let hands = [];

// silhouette
let silhouetteX = null;
let silhouetteY = null;
let silhouetteSmoothX = null;
let silhouetteSmoothY = null;

let observedSilMinX = null;
let observedSilMaxX = null;
let observedSilMinY = null;
let observedSilMaxY = null;

// body segmentation
let segmenter = null;
let segmentationRunning = false;
let captureData;
let latestSilhouette = null;

// UI
let modeButtons = {};
let shapeButtons = {};
let activeMode = "Hand";
let activeShape = "Rectangle";

let sizeSlider;
let sizeLabel;
let clearButton;

// Brush / motion
let angle = 0;
let rotationSpeed = 0.045;
let holdFrames = 14;
let positionSmoothing = 0.5;
let sizeSmoothing = 0.25;
let rangeMargin = 20;

// Adaptive calibration bounds
let observedMinX = null;
let observedMaxX = null;
let observedMinY = null;
let observedMaxY = null;

// Gesture cooldowns
let gestureCooldown = 1200;
let lastScreenshotTime = 0;
let lastClearTime = 0;

// Track separate hand states
let handStates = {
  Left: createHandState(),
  Right: createHandState(),
  Unknown: createHandState()
};

function createHandState() {
  return {
    targetX: null,
    targetY: null,
    smoothX: null,
    smoothY: null,
    targetSize: null,
    smoothSize: null,
    lastSeenFrame: -999
  };
}

function preload() {
  handPose = ml5.handPose({ flipped: true });
}

async function setup() {
  createCanvas(windowWidth, windowHeight);
  background(20);
  imageMode(CENTER);
  angleMode(RADIANS);
  pixelDensity(1);
  // pixelDensity(window.devicePixelRatio);

  video = createCapture(VIDEO);
  // video.size(640, 480);
  video.size(960, 720);
  video.hide();

  // captureData = createGraphics(640, 480);
  captureData = createGraphics(960, 720);

  handPose.detectStart(video, gotHands);

  setupUI();
  setMode("Hand");
  setShape("Rectangle");

  await setupSegmentation();
}

async function setupSegmentation() {
  try {
    const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
    const segmenterConfig = {
      runtime: "tfjs",
      solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@1.0.2"
    };
    segmenter = await bodySegmentation.createSegmenter(model, segmenterConfig);
  } catch (err) {
    console.error("Segmentation failed to load:", err);
  }
}

function setupUI() {
  // MODE LABEL
  let modeLabel = createDiv("Mode");
  modeLabel.class("control-label");
  modeLabel.position(20, 20);
  // MODE BUTTONS
  modeButtons.Hand = createButton("Hand");
  modeButtons.Hand.class("ui-btn active");
  modeButtons.Hand.position(20, 50);
  modeButtons.Hand.mousePressed(() => setMode("Hand"));

  modeButtons.Mouse = createButton("Mouse");
  modeButtons.Mouse.class("ui-btn");
  modeButtons.Mouse.position(140, 50);
  modeButtons.Mouse.mousePressed(() => setMode("Mouse"));

  modeButtons.Silhouette = createButton("Silhouette");
  modeButtons.Silhouette.class("ui-btn");
  modeButtons.Silhouette.position(260, 50);
  modeButtons.Silhouette.mousePressed(() => setMode("Silhouette"));

  // SHAPE LABEL
  let shapeLabel = createDiv("Shape");
  shapeLabel.class("control-label");
  shapeLabel.position(20, 110);

  // SHAPE BUTTONS
  // shapeButtons.Rectangle = createButton(`
  //   <svg viewBox="0 0 100 60">
  //     <rect x="12" y="12" width="76" height="36"></rect>
  //   </svg>
  // `);
  shapeButtons.Rectangle = createButton("");
  shapeButtons.Rectangle.class("rect-btn active");
  shapeButtons.Rectangle.position(20, 145);
  shapeButtons.Rectangle.mousePressed(() => setShape("Rectangle"));

  // shapeButtons.Circle = createButton(`
  //   <svg viewBox="0 0 100 60">
  //     <circle cx="50" cy="30" r="24"></circle>
  //   </svg>
  // `);
  shapeButtons.Circle = createButton("");
  shapeButtons.Circle.class("circle-btn");
  shapeButtons.Circle.position(110, 140);
  shapeButtons.Circle.mousePressed(() => setShape("Circle"));

  // shapeButtons.Star = createButton(`
  //   <svg viewBox="0 0 100 60">
  //     <polygon points="50,4 60,24 84,24 65,38 72,58 50,46 28,58 35,38 16,24 40,24"></polygon>
  //   </svg>
  // `);
  shapeButtons.Star = createButton("");
  shapeButtons.Star.class("star-btn");
  shapeButtons.Star.position(180, 140);
  shapeButtons.Star.mousePressed(() => setShape("Star"));

  // SIZE LABEL
  sizeLabel = createDiv("Base Size");
  sizeLabel.class("control-label");
  sizeLabel.position(20, 220);

  // SIZE SLIDER
  sizeSlider = createSlider(40, 300, 170, 1);
  sizeSlider.addClass("size-slider");
  sizeSlider.position(20, 250);
  sizeSlider.input(updateSliderFill);
  updateSliderFill();

  // CLEAR BUTTON
  clearButton = createButton("Clear Canvas");
  clearButton.class("clear-btn");
  clearButton.position(20, 300);
  clearButton.mousePressed(resetCanvasAndTracking);
}
function setMode(mode) {
  activeMode = mode;

  for (let key in modeButtons) {
    if (key === mode) {
      modeButtons[key].addClass("active");
    } else {
      modeButtons[key].removeClass("active");
    }
  }

  if (mode === "Silhouette") {
    activeShape = "Silhouette";

    for (let key in shapeButtons) {
      shapeButtons[key].attribute("disabled", "");
      shapeButtons[key].removeClass("active");
      shapeButtons[key].style("opacity", "0.45");
      shapeButtons[key].style("pointer-events", "none");
    }
  } else {
    if (activeShape === "Silhouette") {
      activeShape = "Rectangle";
    }

    for (let key in shapeButtons) {
      shapeButtons[key].removeAttribute("disabled");
      shapeButtons[key].style("opacity", "1");
      shapeButtons[key].style("pointer-events", "auto");
    }

    setShape(activeShape);
  }
}

function setShape(shape) {
  activeShape = shape;

  for (let key in shapeButtons) {
    if (key === shape) {
      shapeButtons[key].addClass("active");
    } else {
      shapeButtons[key].removeClass("active");
    }
  }
}

function updateSliderFill() {
  let min = Number(sizeSlider.elt.min);
  let max = Number(sizeSlider.elt.max);
  let val = Number(sizeSlider.value());
  let pct = ((val - min) / (max - min)) * 100;
  sizeSlider.elt.style.setProperty("--fill", pct + "%");
}

function handleModeChange() {
  if (activeMode === "Silhouette") {
    shapeSelect.disable();
  } else {
    shapeSelect.enable();
  }
}

function resetCanvasAndTracking() {
  background(20);

  silhouetteX = null;
  silhouetteY = null;
  silhouetteSmoothX = null;
  silhouetteSmoothY = null;

  observedSilMinX = null;
  observedSilMaxX = null;
  observedSilMinY = null;
  observedSilMaxY = null;

  observedMinX = null;
  observedMaxX = null;
  observedMinY = null;
  observedMaxY = null;

  handStates.Left = createHandState();
  handStates.Right = createHandState();
  handStates.Unknown = createHandState();

  latestSilhouette = null;
}

function gotHands(results) {
  hands = results;
}

function draw() {
  if (activeMode === "Silhouette") {
    drawSilhouetteMode();
  } else if (activeMode === "Hand") {
    updateHandsAndDraw();
  } else {
    drawWithMouse();
  }

  checkGestureCommands();
  drawHUD();
}

function drawWithMouse() {
  if (mouseIsPressed) {
    let baseSize = sizeSlider.value();
    stampVideo(mouseX, mouseY, baseSize);
  }
}

function updateHandsAndDraw() {
  if (hands.length > 0) {
    for (let hand of hands) {
      let indexTip = getIndexTip(hand);
      if (!indexTip) continue;
      updateObservedRange(indexTip.x, indexTip.y);
    }

    let xRange = observedMaxX - observedMinX;
    let yRange = observedMaxY - observedMinY;

    if (xRange >= 60 && yRange >= 60) {
      for (let hand of hands) {
        let indexTip = getIndexTip(hand);
        if (!indexTip) continue;

        let thumbTip = getThumbTip(hand);
        let state = getStateForHand(hand);

        let mappedX = map(
          indexTip.x,
          observedMinX - rangeMargin,
          observedMaxX + rangeMargin,
          0,
          width
        );

        let mappedY = map(
          indexTip.y,
          observedMinY - rangeMargin,
          observedMaxY + rangeMargin,
          0,
          height
        );

        state.targetX = constrain(mappedX, 0, width);
        state.targetY = constrain(mappedY, 0, height);

        let baseSize = sizeSlider.value();
        let pinchScale = 1.0;

        if (thumbTip) {
          let pinchDistance = dist(indexTip.x, indexTip.y, thumbTip.x, thumbTip.y);
          pinchScale = map(
            constrain(pinchDistance, 10, 140),
            10,
            140,
            0.35,
            1.85
          );
        }

        state.targetSize = constrain(baseSize * pinchScale, 20, 600);
        state.lastSeenFrame = frameCount;
      }
    }
  }

  for (let key of Object.keys(handStates)) {
    let state = handStates[key];
    let recentlySeen = frameCount - state.lastSeenFrame <= holdFrames;

    if (
      !recentlySeen ||
      state.targetX === null ||
      state.targetY === null ||
      state.targetSize === null
    ) {
      continue;
    }

    if (state.smoothX === null || state.smoothY === null) {
      state.smoothX = state.targetX;
      state.smoothY = state.targetY;
    } else {
      state.smoothX = lerp(state.smoothX, state.targetX, positionSmoothing);
      state.smoothY = lerp(state.smoothY, state.targetY, positionSmoothing);
    }

    if (state.smoothSize === null) {
      state.smoothSize = state.targetSize;
    } else {
      state.smoothSize = lerp(state.smoothSize, state.targetSize, sizeSmoothing);
    }

    stampVideo(state.smoothX, state.smoothY, state.smoothSize);
  }
}

function stampVideo(x, y, baseSize) {
  let currentW = baseSize;
  let currentH = baseSize * 0.75;
  let currentShape = activeShape;

  push();
  translate(x, y);
  rotate(angle);

  let ctx = drawingContext;
  ctx.save();

  if (currentShape === "Circle") {
    ctx.beginPath();
    ctx.arc(0, 0, min(currentW, currentH) / 2, 0, TWO_PI);
    ctx.closePath();
    ctx.clip();
  } else if (currentShape === "Star") {
    ctx.beginPath();
    buildStarPath(
      ctx,
      0,
      0,
      min(currentW, currentH) * 0.22,
      min(currentW, currentH) * 0.5,
      5
    );
    ctx.closePath();
    ctx.clip();
  }

  push();
  scale(-1, 1);
  image(video, 0, 0, currentW, currentH);
  pop();

  ctx.restore();
  pop();

  angle += rotationSpeed;
}

function drawSilhouetteMode() {
  if (!segmenter) return;

  if (!segmentationRunning) {
    segmentationRunning = true;

    captureData.clear();
    captureData.push();
    captureData.translate(captureData.width, 0);
    captureData.scale(-1, 1);
    captureData.image(video, 0, 0, captureData.width, captureData.height);
    captureData.pop();

    segmenter.segmentPeople(captureData.elt, {
      flipHorizontal: false,
      multiSegmentation: false,
      segmentBodyParts: false
    })
      .then((res) => {
        if (!res || !res[0] || !res[0].mask) return null;
        return res[0].mask.toImageData();
      })
      .then((maskImg) => {
        if (!maskImg) {
          segmentationRunning = false;
          return;
        }

        latestSilhouette = buildSilhouetteImage(captureData, maskImg);
        updateSilhouettePosition(maskImg);
        segmentationRunning = false;
      })
      .catch((err) => {
        console.error(err);
        segmentationRunning = false;
      });
  }

  if (latestSilhouette && silhouetteSmoothX !== null && silhouetteSmoothY !== null) {
    let baseSize = sizeSlider.value();
    let scaleAmt = baseSize / 170;

    push();
    image(
      latestSilhouette,
      silhouetteSmoothX,
      silhouetteSmoothY,
      latestSilhouette.width * scaleAmt,
      latestSilhouette.height * scaleAmt
    );
    pop();
  }
}

function updateSilhouettePosition(maskImg) {
  let info = getSilhouetteInfo(maskImg);
  if (!info) return;

  updateSilhouetteObservedRange(info.cx, info.cy);

  let xRange = observedSilMaxX - observedSilMinX;
  let yRange = observedSilMaxY - observedSilMinY;

  if (xRange < 30 || yRange < 30) return;

  silhouetteX = map(
    info.cx,
    observedSilMinX - rangeMargin,
    observedSilMaxX + rangeMargin,
    0,
    width
  );

  silhouetteY = map(
    info.cy,
    observedSilMinY - rangeMargin,
    observedSilMaxY + rangeMargin,
    0,
    height
  );

  silhouetteX = constrain(silhouetteX, 0, width);
  silhouetteY = constrain(silhouetteY, 0, height);

  if (silhouetteSmoothX === null || silhouetteSmoothY === null) {
    silhouetteSmoothX = silhouetteX;
    silhouetteSmoothY = silhouetteY;
  } else {
    silhouetteSmoothX = lerp(silhouetteSmoothX, silhouetteX, 0.28);
    silhouetteSmoothY = lerp(silhouetteSmoothY, silhouetteY, 0.28);
  }
}

function getSilhouetteInfo(maskImg) {
  let data = maskImg.data;
  let w = maskImg.width;
  let h = maskImg.height;

  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx = (y * w + x) * 4;
      let alpha = data[idx];

      if (alpha > 40) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  if (count === 0) return null;

  return {
    cx: sumX / count,
    cy: sumY / count
  };
}

function updateSilhouetteObservedRange(x, y) {
  if (observedSilMinX === null) {
    observedSilMinX = x;
    observedSilMaxX = x;
    observedSilMinY = y;
    observedSilMaxY = y;
    return;
  }

  observedSilMinX = min(observedSilMinX, x);
  observedSilMaxX = max(observedSilMaxX, x);
  observedSilMinY = min(observedSilMinY, y);
  observedSilMaxY = max(observedSilMaxY, y);
}

function buildSilhouetteImage(sourceGfx, maskImg) {
  let w = sourceGfx.width;
  let h = sourceGfx.height;

  let out = createImage(w, h);

  sourceGfx.loadPixels();
  out.loadPixels();

  for (let i = 0; i < out.pixels.length; i += 4) {
    let maskValue = maskImg.data[i];

    out.pixels[i] = sourceGfx.pixels[i];
    out.pixels[i + 1] = sourceGfx.pixels[i + 1];
    out.pixels[i + 2] = sourceGfx.pixels[i + 2];
    out.pixels[i + 3] = maskValue > 40 ? 255 : 0;
  }

  out.updatePixels();
  return out;
}

function getStateForHand(hand) {
  let label = hand.handedness || "Unknown";
  if (label !== "Left" && label !== "Right") {
    label = "Unknown";
  }
  return handStates[label];
}

function updateObservedRange(x, y) {
  if (observedMinX === null) {
    observedMinX = x;
    observedMaxX = x;
    observedMinY = y;
    observedMaxY = y;
    return;
  }

  observedMinX = min(observedMinX, x);
  observedMaxX = max(observedMaxX, x);
  observedMinY = min(observedMinY, y);
  observedMaxY = max(observedMaxY, y);
}

function buildStarPath(ctx, x, y, innerRadius, outerRadius, points) {
  let step = TWO_PI / points;
  let halfStep = step / 2;

  for (let a = -HALF_PI, i = 0; i < points; i++, a += step) {
    let x1 = x + cos(a) * outerRadius;
    let y1 = y + sin(a) * outerRadius;
    let x2 = x + cos(a + halfStep) * innerRadius;
    let y2 = y + sin(a + halfStep) * innerRadius;

    if (i === 0) {
      ctx.moveTo(x1, y1);
    } else {
      ctx.lineTo(x1, y1);
    }

    ctx.lineTo(x2, y2);
  }
}

function checkGestureCommands() {
  if (!hands || hands.length === 0) return;

  let now = millis();

  for (let hand of hands) {
    if (isThumbsUp(hand)) {
      if (now - lastScreenshotTime > gestureCooldown) {
        saveCanvas("webcam-trail", "png");
        lastScreenshotTime = now;
      }
      return;
    }

    if (isThumbsDown(hand)) {
      if (now - lastClearTime > gestureCooldown) {
        resetCanvasAndTracking();
        lastClearTime = now;
      }
      return;
    }
  }
}

function isThumbsUp(hand) {
  let thumb = getThumbTip(hand);
  let thumbBase = getThumbBase(hand);

  let indexTip = getIndexTip(hand);
  let middleTip = getFingerTip(hand, "middle");
  let ringTip = getFingerTip(hand, "ring");
  let pinkyTip = getFingerTip(hand, "pinky");

  let indexBase = getFingerBase(hand, "index");
  let middleBase = getFingerBase(hand, "middle");
  let ringBase = getFingerBase(hand, "ring");
  let pinkyBase = getFingerBase(hand, "pinky");

  if (!thumb || !thumbBase || !indexTip || !middleTip || !ringTip || !pinkyTip) return false;
  if (!indexBase || !middleBase || !ringBase || !pinkyBase) return false;

  let pinchDistance = dist(thumb.x, thumb.y, indexTip.x, indexTip.y);
  let notPinching = pinchDistance > 45;

  let thumbUp = thumb.y < thumbBase.y - 25;

  let indexCurled = indexTip.y > indexBase.y - 10;
  let middleCurled = middleTip.y > middleBase.y - 10;
  let ringCurled = ringTip.y > ringBase.y - 10;
  let pinkyCurled = pinkyTip.y > pinkyBase.y - 10;

  return notPinching && thumbUp && indexCurled && middleCurled && ringCurled && pinkyCurled;
}

function isThumbsDown(hand) {
  let thumb = getThumbTip(hand);
  let thumbBase = getThumbBase(hand);

  let indexTip = getIndexTip(hand);
  let middleTip = getFingerTip(hand, "middle");
  let ringTip = getFingerTip(hand, "ring");
  let pinkyTip = getFingerTip(hand, "pinky");

  let indexBase = getFingerBase(hand, "index");
  let middleBase = getFingerBase(hand, "middle");
  let ringBase = getFingerBase(hand, "ring");
  let pinkyBase = getFingerBase(hand, "pinky");

  if (!thumb || !thumbBase || !indexTip || !middleTip || !ringTip || !pinkyTip) return false;
  if (!indexBase || !middleBase || !ringBase || !pinkyBase) return false;

  let pinchDistance = dist(thumb.x, thumb.y, indexTip.x, indexTip.y);
  let notPinching = pinchDistance > 45;

  let thumbDown = thumb.y > thumbBase.y + 25;

  let indexCurled = indexTip.y > indexBase.y - 10;
  let middleCurled = middleTip.y > middleBase.y - 10;
  let ringCurled = ringTip.y > ringBase.y - 10;
  let pinkyCurled = pinkyTip.y > pinkyBase.y - 10;

  return notPinching && thumbDown && indexCurled && middleCurled && ringCurled && pinkyCurled;
}

function getIndexTip(hand) {
  if (!hand) return null;
  if (hand.index_finger_tip) return hand.index_finger_tip;

  if (hand.keypoints) {
    for (let kp of hand.keypoints) {
      if (kp.name === "index_finger_tip" || kp.part === "index_finger_tip") {
        return kp;
      }
    }
    if (hand.keypoints[8]) return hand.keypoints[8];
  }

  return null;
}

function getThumbTip(hand) {
  if (!hand) return null;
  if (hand.thumb_tip) return hand.thumb_tip;

  if (hand.keypoints) {
    for (let kp of hand.keypoints) {
      if (kp.name === "thumb_tip" || kp.part === "thumb_tip") {
        return kp;
      }
    }
    if (hand.keypoints[4]) return hand.keypoints[4];
  }

  return null;
}

function getThumbBase(hand) {
  return getNamedKeypoint(hand, ["thumb_mcp", "thumb_cmc"], [2, 1]);
}

function getFingerTip(hand, fingerName) {
  if (fingerName === "index") return getNamedKeypoint(hand, ["index_finger_tip"], [8]);
  if (fingerName === "middle") return getNamedKeypoint(hand, ["middle_finger_tip"], [12]);
  if (fingerName === "ring") return getNamedKeypoint(hand, ["ring_finger_tip"], [16]);
  if (fingerName === "pinky") return getNamedKeypoint(hand, ["pinky_finger_tip"], [20]);
  return null;
}

function getFingerBase(hand, fingerName) {
  if (fingerName === "index") return getNamedKeypoint(hand, ["index_finger_mcp"], [5]);
  if (fingerName === "middle") return getNamedKeypoint(hand, ["middle_finger_mcp"], [9]);
  if (fingerName === "ring") return getNamedKeypoint(hand, ["ring_finger_mcp"], [13]);
  if (fingerName === "pinky") return getNamedKeypoint(hand, ["pinky_finger_mcp"], [17]);
  return null;
}

function getNamedKeypoint(hand, possibleNames, fallbackIndices = []) {
  if (!hand) return null;

  for (let name of possibleNames) {
    if (hand[name]) return hand[name];
  }

  if (hand.keypoints) {
    for (let name of possibleNames) {
      for (let kp of hand.keypoints) {
        if (kp.name === name || kp.part === name) {
          return kp;
        }
      }
    }

    for (let idx of fallbackIndices) {
      if (hand.keypoints[idx]) return hand.keypoints[idx];
    }
  }

  return null;
}

function drawHUD() {
  noStroke();
  fill(255);
  textSize(13);

  if (activeMode === "Silhouette") {
    text("Silhouette mode draws segmented body trails.", 20, height - 28);
  } else {
    text("Pinch smaller / open bigger in Hand mode.", 20, height - 28);
  }

  text("Thumbs up = screenshot, thumbs down = clear.", 20, height - 10);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}