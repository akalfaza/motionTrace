let video;
let handPose;
let hands = [];

let angle = 0;

// UI
let modeSelect;
let shapeSelect;
let sizeSlider;
let sizeLabel;
// let showCameraCheckbox;
let clearButton;

// Brush / motion
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

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(20);
  imageMode(CENTER);
  angleMode(RADIANS);

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  handPose.detectStart(video, gotHands);

  setupUI();
}

function setupUI() {
  modeSelect = createSelect();
  modeSelect.position(20, 20);
  modeSelect.option("Hand");
  modeSelect.option("Mouse");
  modeSelect.selected("Hand");

  shapeSelect = createSelect();
  shapeSelect.position(20, 55);
  shapeSelect.option("Rectangle");
  shapeSelect.option("Circle");
  shapeSelect.option("Star");
  shapeSelect.selected("Rectangle");

  sizeLabel = createDiv("Base size");
  sizeLabel.position(20, 88);
  sizeLabel.style("color", "white");
  sizeLabel.style("font-size", "13px");

  sizeSlider = createSlider(40, 300, 170, 1);
  sizeSlider.position(20, 110);
  sizeSlider.style("width", "150px");

  // showCameraCheckbox = createCheckbox(" Show live camera", false);
  // showCameraCheckbox.position(20, 145);
  // showCameraCheckbox.style("color", "white");

  clearButton = createButton("Clear canvas");
  clearButton.position(20, 180);
  clearButton.mousePressed(resetCanvasAndTracking);
}

function resetCanvasAndTracking() {
  background(20);

  observedMinX = null;
  observedMaxX = null;
  observedMinY = null;
  observedMaxY = null;

  handStates.Left = createHandState();
  handStates.Right = createHandState();
  handStates.Unknown = createHandState();
}

function gotHands(results) {
  hands = results;
}

function draw() {
  // if (showCameraCheckbox.checked()) {
  //   drawCameraPreview();
  // }

  if (modeSelect.value() === "Hand") {
    updateHandsAndDraw();
    checkGestureCommands();
  } else {
    drawWithMouse();
  }

  drawHUD();
}

function drawCameraPreview() {
  push();
  tint(255, 75);
  translate(width, 0);
  scale(-1, 1);
  image(video, width / 2, height / 2, width, height);
  pop();
}

function drawWithMouse() {
  if (mouseIsPressed) {
    let baseSize = sizeSlider.value();
    stampVideo(mouseX, mouseY, baseSize);
  }
}

function updateHandsAndDraw() {
  if (hands.length > 0) {
    // Update observed coordinate range using all visible hands
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

          // pinch smaller / open bigger
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

  // Smooth and draw each tracked hand
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

function stampVideo(x, y, baseSize) {
  let currentW = baseSize;
  let currentH = baseSize * 0.75;
  let currentShape = shapeSelect.value();

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
  text("Mode: " + modeSelect.value(), 20, height - 82);
  text("Shape: " + shapeSelect.value(), 20, height - 64);
  text("Base size: " + sizeSlider.value(), 20, height - 46);
  text("Pinch smaller / open bigger in Hand mode.", 20, height - 28);
  text("Thumbs up = screenshot, thumbs down = clear.", 20, height - 10);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}