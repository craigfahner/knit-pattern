const rulerSize = 30; // width of the ruler strip on each side, in pixels

let drawWindowWidth = 760;
let drawWindowHeight = 530; // just below the bottom of the camo generator box
let margin = 20;
let pixelWidth = 48; // max 48
let pixelHeight = 48; // max 48
let pixelScale = 8;
let colourBoxSize = 20;
let currentColour = 0;
let colourBoxes = [];
let widthInput;
let heightInput;
let scaleInput;
let bgScale = 5;

let windowOpen = true; // design window open
let windowButton;
let windowUI = []; // every DOM element that belongs to the design window

let locked = false; // true once a run is marked: blocks everything except pattern scale
let lockableUI = []; // DOM controls that are disabled while locked
let doneRuns = new Set(); // marked runs, keyed "row:start"

const SESSION_KEY = "knitCamoSession"; // localStorage key for the saved session
let erasing = false; // true after the saved session is erased, so nothing re-saves it before the reload
let lastSavedJSON = ""; // last thing written, so unchanged state isn't rewritten
let resetButton;
let lockButton;

let pieceWidth = 100; // whole number, set by the "width of piece" field
let pieceHeight = 100; // whole number, set by the "height of piece" field
let pieceWidthInput;
let pieceHeightInput;
let pieceRuns = []; // pieceRuns[row] = [{ start, len, code }, ...] - tracks runs of like colours in rows
let textColourCache = {}; // stitch colour -> black or white text

let knitMode = true;

let picker;
let editingBox = 0;

let pixelGrid = [];

let imageChanged = true;
let tile;

let saveButton;
let saveImageButton; // whole piece as a PNG, with stitch counts
let savePieceButton; // session data as a JSON file
let loadPieceButton;
let exporting = false; // true while the piece image is being rendered (pauses autosave)

let camoButton;
let prevCamoButton; // step back / forward through camoHistory
let nextCamoButton;
let starCamoButton; // stars / unstars the pattern that's showing
let camoHistory = []; // every generated pattern this session: { w, h, grid, starred } (not saved)
let camoIndex = -1; // which entry of camoHistory is showing
let generating = false; // true while generateCamoKnit() runs
let fillButton; // fills the pattern with the selected colour
let resetWhiteButton; // restores every whited-out stitch
let helpButton;
let helpDialog; // native <dialog> holding the help text
let camoStatus; // DOM label under "generate camo": "generating...", failure message, or blank
let lockWarning; // red DOM label shown beside the reset button while locked
let colourBoxLabels = []; // DOM numbers on top of the colour boxes

// button grid under the pattern editor (sized to the 48x48 maximum)
const btnTop = margin + 48 * pixelScale + 10; // just below the editor at its largest
const btnRowH = 24;
const btnColW = 128; // three columns across the 384px editor
const btnW = 124;

let mainCanvas; // the piece canvas element (clicks on it mark runs / white out stitches)

// floating, draggable editor window (its own DOM panel with its own canvas)
const titleH = 16; // height of the title bar
let panelDiv; // the whole floating window
let panelTitle; // draggable title bar
let panelScroll; // scrolls the window's contents on short screens
let panelContent; // holds the panel canvas and every control, in panel coordinates
let pg; // p5.Graphics the panel is drawn into
let panelCanvasEl; // pg's canvas element
let panelX = 0; // window position on screen (px from the viewport's left / top)
let panelY = 0;
let panelDrag = null; // offset from the pointer to the window corner while dragging
let painting = false; // dragging in the pattern editor

// piece shaping: stitches that are whited out (not part of the piece), keyed "row:col"
let removedStitches = new Set();
let whiteDrag = null; // "remove" or "restore" during a shift-drag on the piece
let lastKnitRow = -1; // lowest row (largest index) that still has stitches; row 1 for the rulers

// knit camo controls (sliders etc.), laid out in a 2-column grid below the camo button
let knitControls = [];
const camoGroupTop = 218; // panel y of the camo generator box
const knitGridTop = 262; // panel y of the first row of camo controls
const knitRowH = 36; // height of each row
const knitColGap = 170; // distance between the right edges of the two columns
const knitSliderW = 140; // width of sliders and dropdowns

function setup() {

	let cnv = createCanvas(windowWidth, windowHeight);
	pixelDensity(1);
	noSmooth();

	mainCanvas = cnv.elt;

	// build the floating editor window first: every control is placed inside it
	createPanel();

	colourBoxes[0] = new ColourBox("#523511", 0, drawWindowWidth - 70, 140);
	colourBoxes[1] = new ColourBox("#e3d754", 1, drawWindowWidth - 40, 140);
	colourBoxes[2] = new ColourBox("#62a839", 2, drawWindowWidth - 70, 170);
	colourBoxes[3] = new ColourBox("#c99506", 3, drawWindowWidth - 40, 170);
	createPanelLabels();

	// ---- right column: pattern size ----
	widthInput = createInput("48", "number");
	widthInput.attribute("step", "1");
	widthInput.attribute("min", "1");
	widthInput.attribute("max", "48");
	placeUI(widthInput, colA() - 60, 40);
	widthInput.size(52);
	widthInput.changed(() => {
		let v = int(widthInput.value());
		if (!isNaN(v)) pixelWidth = constrain(v, 1, 48);
		widthInput.value(pixelWidth); // show the cleaned-up value
		imageChanged = true;
		computeRuns();
	});

	heightInput = createInput("48", "number");
	heightInput.attribute("step", "1");
	heightInput.attribute("min", "2");
	heightInput.attribute("max", "48");
	placeUI(heightInput, colA() - 60, 90);
	heightInput.size(52);
	heightInput.changed(() => {
		let v = int(heightInput.value());
		if (!isNaN(v)) pixelHeight = constrain(v, 2, 48);
		heightInput.value(pixelHeight);
		imageChanged = true;
		computeRuns();
	});

	// ---- left column: piece size and scale ----
	pieceWidthInput = createInput(str(pieceWidth), "number");
	pieceWidthInput.attribute("step", "1");
	pieceWidthInput.attribute("min", "1");
	pieceWidthInput.attribute("max", "999");
	placeUI(pieceWidthInput, colB() - 60, 40);
	pieceWidthInput.size(52);
	pieceWidthInput.changed(() => {
		let v = int(pieceWidthInput.value());
		if (!isNaN(v)) pieceWidth = constrain(v, 1, 999);
		pieceWidthInput.value(pieceWidth);
		pruneRemoved();
		computeRuns();
		updateCanvasSize();
	});

	pieceHeightInput = createInput(str(pieceHeight), "number");
	pieceHeightInput.attribute("step", "1");
	pieceHeightInput.attribute("min", "1");
	pieceHeightInput.attribute("max", "999");
	placeUI(pieceHeightInput, colB() - 60, 90);
	pieceHeightInput.size(52);
	pieceHeightInput.changed(() => {
		let v = int(pieceHeightInput.value());
		if (!isNaN(v)) pieceHeight = constrain(v, 1, 999);
		pieceHeightInput.value(pieceHeight);
		pruneRemoved();
		computeRuns();
		updateCanvasSize();
	});

	scaleInput = createInput(str(bgScale), "number");
	scaleInput.attribute("step", "1");
	scaleInput.attribute("min", "1");
	scaleInput.attribute("max", "30");
	placeUI(scaleInput, colB() - 60, 140);
	scaleInput.size(52);
	scaleInput.changed(() => {
		let v = int(scaleInput.value());
		if (!isNaN(v)) setScale(v);
		else scaleInput.value(bgScale);
	});
	updateCanvasSize();

	// ---- camo generator box ----
	camoButton = panelButton("generate camo");
	placeUI(camoButton, colB() - knitSliderW, camoGroupTop + 10);
	camoButton.mousePressed(camo);

	// history arrows, just right of the camo button
	let arrowX = colB() - knitSliderW + camoButton.elt.offsetWidth + 4;
	prevCamoButton = panelButton("\u2190");
	placeUI(prevCamoButton, arrowX, camoGroupTop + 10);
	prevCamoButton.mousePressed(() => showCamo(camoIndex - 1));
	nextCamoButton = panelButton("\u2192");
	placeUI(nextCamoButton, arrowX + prevCamoButton.elt.offsetWidth + 2, camoGroupTop + 10);
	nextCamoButton.mousePressed(() => showCamo(camoIndex + 1));
	starCamoButton = panelButton("\u2606");
	placeUI(starCamoButton, nextCamoButton.elt.offsetLeft + nextCamoButton.elt.offsetWidth + 2, camoGroupTop + 10);
	starCamoButton.mousePressed(toggleStar);
	// the star glyph comes from a fallback font with a taller line box, so pin the arrows and
	// star to the camo button's height (buttons are border-box, so this is the outer height)
	let rowH = camoButton.elt.offsetHeight + "px";
	for (let b of [prevCamoButton, nextCamoButton, starCamoButton]) {
		b.style("height", rowH);
		b.style("line-height", "1");
	}
	updateHistoryButtons();
	camoStatus = panelLabel("", colB() - knitSliderW, camoGroupTop + 30,
		{ valign: "top", align: "left", size: 10 });

	// ---- fill: under the zoom hint, left of the shift-click hint ----
	fillButton = panelButton("fill with selected colour");
	fillButton.size(130);
	placeUI(fillButton, colB() - 130, 190);
	fillButton.mousePressed(fillPattern);

	// ---- button grid under the pattern editor ----
	saveButton = panelButton("save tile as png");
	placeBtn(saveButton, 0, 0);
	saveButton.mousePressed(saveTile);

	saveImageButton = panelButton("save piece as png");
	placeBtn(saveImageButton, 1, 0);
	saveImageButton.mousePressed(savePieceImage);

	helpButton = panelButton("help");
	placeBtn(helpButton, 2, 0);
	helpButton.mousePressed(() => helpDialog.elt.showModal());

	savePieceButton = panelButton("save piece data");
	placeBtn(savePieceButton, 0, 1);
	savePieceButton.mousePressed(savePieceFile);

	loadPieceButton = panelButton("load piece data");
	placeBtn(loadPieceButton, 1, 1);
	loadPieceButton.mousePressed(loadPieceFile);

	resetWhiteButton = panelButton("reset white tiles");
	placeBtn(resetWhiteButton, 2, 1);
	resetWhiteButton.mousePressed(resetWhiteout);

	createHelpDialog();

	picker = createColorPicker("#000000");
	picker.position(-100, -100); // off screen
	picker.input(() => {
		colourBoxes[editingBox].colour = picker.value();
		imageChanged = true;
	});

	for (let y = 0; y < 52; y++) {
		pixelGrid[y] = [];
		for (let x = 0; x < 52; x++) {
			pixelGrid[y][x] = currentColour;
		}
	}
	computeRuns();

	createKnitControls();

	windowButton = panelButton("close editor window");
	windowButton.style("font-weight", "bold");
	windowButton.mousePressed(toggleWindow);
	placeWindowButton();

	// collect everything that should hide with the window
	windowUI = [
		widthInput, heightInput, scaleInput,
		pieceWidthInput, pieceHeightInput,
		camoButton, prevCamoButton, nextCamoButton, starCamoButton, fillButton, saveButton, saveImageButton,
		savePieceButton, loadPieceButton, helpButton, resetWhiteButton
	];
	for (let cell of knitControls) {
		if (cell.el) windowUI.push(cell.el); // sliders, checkbox, dropdown
		if (cell.els) windowUI.push(...cell.els); // palette checkboxes
	}

	// while locked, only scale, saving and loading stay available
	// (white-out works any time, so "reset white tiles" stays on too)
	const alwaysOn = [scaleInput, saveButton, saveImageButton, savePieceButton, loadPieceButton,
		helpButton, resetWhiteButton];
	// (the history arrows and star aren't in lockableUI: updateHistoryButtons() handles them,
	// since they also grey out at either end of the history)
	lockableUI = windowUI.filter(el => !alwaysOn.includes(el) &&
		el != prevCamoButton && el != nextCamoButton && el != starCamoButton);

	// lock and reset share one spot: only one is shown at a time
	resetButton = panelButton("reset tracking");
	placeBtn(resetButton, 0, 2);
	resetButton.mousePressed(resetTracking);
	resetButton.hide(); // only shown while locked

	lockButton = panelButton("lock in pattern");
	placeBtn(lockButton, 0, 2);
	lockButton.mousePressed(() => setLocked(true));

	updateResetButton(); // set the starting visibility of both buttons

	// default window position: top-right of the screen (a saved session may move it)
	panelX = document.documentElement.clientWidth - panelDiv.elt.offsetWidth - margin;
	panelY = margin;
	applyPanelPos();
	updateCanvasSize();

	// restore the previous session if there is one; otherwise the pattern stays filled
	// with colour 0 (pixelGrid is filled with currentColour, which starts at 0, above)
	loadSession();

	// save one last time when the tab or window is closed
	window.addEventListener("beforeunload", saveSession);
}

// right edge of the right column, in panel coordinates
function colA() {
	return drawWindowWidth - 20;
}

// right edge of the left column, in panel coordinates
function colB() {
	return colA() - knitColGap;
}

// bottom of the camo generator box (below the last row of camo controls)
function camoGroupBottom() {
	return knitGridTop + ceil(knitControls.length / 2) * knitRowH + 4;
}

// position a DOM element in panel coordinates
// position a DOM control inside the editor window, in panel coordinates
function placeUI(el, px, py) {
	el.parent(panelContent);
	el.position(px, py);
	el.style("position", "absolute");
}

// a DOM text label in the editor window (sharper than text() on the density-1 canvas)
// x is the right edge for align "right" (like textAlign(RIGHT)), else the left edge
// y is the text baseline, or the top with valign "top"
function panelLabel(txt, x, y, opts = {}) {
	let size = opts.size || 12;
	let el = createDiv(txt);
	el.parent(panelContent);
	el.style("position", "absolute");
	el.style("font", (opts.bold ? "bold " : "") + size + "px sans-serif");
	el.style("line-height", "1");
	el.style("white-space", "nowrap");
	el.style("pointer-events", "none"); // clicks go through to the canvas underneath
	el.style("user-select", "none");
	if (opts.colour) el.style("color", opts.colour);
	let top = opts.valign == "top" ? y : y - round(size * 0.78); // baseline is ~0.78em down
	el.style("top", top + "px");
	if (opts.align == "left") el.style("left", x + "px");
	else el.style("right", (drawWindowWidth - x) + "px");
	return el;
}

// the editor window's fixed labels
function createPanelLabels() {
	panelLabel("width of pattern", colA(), 30);
	panelLabel("height of pattern", colA(), 80);
	panelLabel("width of piece", colB(), 30);
	panelLabel("height of piece", colB(), 80);
	panelLabel("pattern scale", colB(), 130);
	panelLabel("zoom with \u2013 and + keys", colB(), 178, { size: 10 });
	panelLabel("select colour", colA(), 130);
	panelLabel("shift-click a colour to edit it", colA(), 208, { size: 10 });
	panelLabel("CAMO GENERATOR", colA(), camoGroupTop + 12, { valign: "top", bold: true });

	// numbers centred on the colour boxes
	colourBoxLabels = colourBoxes.map(b => {
		let el = panelLabel(b.id, b.x, b.y, { valign: "top", align: "left" });
		el.style("width", colourBoxSize + "px");
		el.style("line-height", colourBoxSize + "px");
		el.style("text-align", "center");
		return el;
	});

	// on its own line under the button grid, so it doesn't run under the close button
	lockWarning = panelLabel("warning: resetting will discard stitch tracking!",
		margin, btnTop + 3 * btnRowH, { valign: "top", align: "left", size: 10, colour: "rgb(180, 0, 0)" });
	lockWarning.hide();
}

// a button with small text, used for every button in the editor window
function panelButton(label) {
	let b = createButton(label);
	b.style("font-size", "9px");
	b.style("padding", "2px 4px");
	return b;
}

// place a button in the grid under the pattern editor (col 0-2, row 0-2)
function placeBtn(el, col, row) {
	placeUI(el, margin + col * btnColW, btnTop + row * btnRowH);
	el.size(btnW);
}

// help text, shown in a native dialog (dimmed background, closes with Escape)
function createHelpDialog() {
	helpDialog = createElement("dialog");
	helpDialog.style("max-width", "520px");
	helpDialog.style("max-height", "80vh");
	helpDialog.style("overflow-y", "auto");
	helpDialog.style("font", "12px sans-serif");
	helpDialog.style("line-height", "1.4");
	helpDialog.style("border", "1px solid #000");
	helpDialog.style("box-shadow", "4px 4px 0 #000");
	helpDialog.html(`
		<h3>Knit camo settings</h3>
		<p><b>colours used:</b> which palette colours the pattern can use (pick at least 2)<br>
		<b>strict neighbours:</b> on = every stitch needs a same-colour neighbour above, below, left or right; off = a diagonal neighbour also counts<br>
		<b>diagonal direction:</b> which way shapes lean from row to row<br>
		<b>max vertical run:</b> most stitches of one colour allowed in a column<br>
		<b>max gap (hard):</b> every stretch this long in a row must contain every colour (limits float length)<br>
		<b>ideal gap (soft):</b> the same, but a preference rather than a rule<br>
		<b>left / up / diagonal weight:</b> how strongly a stitch copies the colour to its left, above or diagonally above; higher = bigger shapes<br>
		<b>overdue boost:</b> pushes colours that haven't appeared recently (1 = off)<br>
		<b>lonely boost:</b> helps stitches pair up so none are left on their own<br>
		<b>repair passes:</b> clean-up rounds that fix any remaining lone stitches<br>
		<b>attempts:</b> how many patterns to try; the best one is kept<br>
		<b>time limit:</b> maximum search time in ms; lower = faster but rougher</p>
		<h3>Designing</h3>
		<p>Click or drag in the pattern grid to paint with the selected colour. Shift-click a colour to edit it.
		"fill with selected colour" paints the whole pattern. Zoom the piece with the – and + keys.</p>
		<h3>The piece</h3>
		<p>Press Escape to close or open the editor window (or use its &times; box or the "close editor window" button).</p>
		<p>Close the editor window, then click a run on the piece to mark it as knitted (this locks the pattern).<br>
		Shift-click or shift-drag on the piece to white out stitches and shape its edges, even while knitting; shift-click again to restore.
		"reset white tiles" restores every whited-out stitch.</p>
		<h3>Saving</h3>
		<p>The state of your session is saved automatically in this browser. You only need to save / load the piece file if you are changing browsers or want a backup. To erase the locally stored data, <a href="#" id="eraseLocalLink">click here</a>.</p>
	`);
	helpDialog.elt.querySelector("#eraseLocalLink").addEventListener("click", e => {
		e.preventDefault(); // don't follow the "#" link
		eraseLocalData();
	});
	let close = createButton("close");
	close.parent(helpDialog);
	close.mousePressed(() => helpDialog.elt.close());
}

// build the floating editor window: title bar, scroll area, canvas
function createPanel() {
	panelDiv = createDiv();
	panelDiv.style("position", "fixed");
	panelDiv.style("z-index", "10");
	panelDiv.style("background", "#f0f0f0");
	panelDiv.style("border", "1px solid #000");
	panelDiv.style("box-shadow", "4px 4px 0 #000");
	panelDiv.style("white-space", "nowrap"); // keep every control label on one line

	panelTitle = createDiv("pattern editing window");
	panelTitle.parent(panelDiv);
	panelTitle.style("height", titleH + "px");
	panelTitle.style("line-height", titleH + "px");
	panelTitle.style("font", "11px sans-serif");
	panelTitle.style("text-align", "center");
	panelTitle.style("background", "#c8c8c8");
	panelTitle.style("border-bottom", "1px solid #000");
	panelTitle.style("cursor", "move");
	panelTitle.style("user-select", "none");
	panelTitle.style("touch-action", "none");
	panelTitle.style("position", "relative"); // so the close box can sit in its corner

	// close box in the title bar's right corner, inset 2px
	let closeBox = createDiv("&times;");
	closeBox.parent(panelTitle);
	let boxSize = titleH - 4;
	closeBox.style("position", "absolute");
	closeBox.style("top", "2px");
	closeBox.style("right", "2px");
	closeBox.style("width", boxSize + "px");
	closeBox.style("height", boxSize + "px");
	closeBox.style("box-sizing", "border-box");
	closeBox.style("border", "1px solid #000");
	closeBox.style("background", "#f0f0f0");
	closeBox.style("line-height", (boxSize - 2) + "px");
	closeBox.style("font-size", "11px");
	closeBox.style("cursor", "pointer");
	// stop the title bar from starting a drag (its pointer capture would swallow the click)
	closeBox.elt.addEventListener("pointerdown", e => e.stopPropagation());
	closeBox.elt.addEventListener("click", toggleWindow);

	panelScroll = createDiv();
	panelScroll.parent(panelDiv);
	panelScroll.style("overflow-y", "auto");
	panelScroll.style("overflow-x", "hidden");

	panelContent = createDiv();
	panelContent.parent(panelScroll);
	panelContent.style("position", "relative");
	panelContent.style("width", drawWindowWidth + "px");
	panelContent.style("height", drawWindowHeight + "px");

	// the panel's drawn parts (labels, editor, colour boxes) go on their own canvas
	pg = createGraphics(drawWindowWidth, drawWindowHeight);
	pg.pixelDensity(1);
	panelCanvasEl = pg.elt || pg.canvas;
	panelContent.elt.appendChild(panelCanvasEl);
	panelCanvasEl.style.display = "block";
	panelCanvasEl.style.position = "absolute";
	panelCanvasEl.style.left = "0px";
	panelCanvasEl.style.top = "0px";
	panelCanvasEl.style.touchAction = "none";

	// ---- dragging the window by its title bar ----
	panelTitle.elt.addEventListener("pointerdown", e => {
		panelDrag = { dx: e.clientX - panelX, dy: e.clientY - panelY };
		panelTitle.elt.setPointerCapture(e.pointerId);
		e.preventDefault();
	});
	panelTitle.elt.addEventListener("pointermove", e => {
		if (!panelDrag) return;
		panelX = e.clientX - panelDrag.dx;
		panelY = e.clientY - panelDrag.dy;
		applyPanelPos();
	});
	const endDrag = () => {
		if (!panelDrag) return;
		panelDrag = null;
		saveSession(); // remember where the window was left
	};
	panelTitle.elt.addEventListener("pointerup", endDrag);
	panelTitle.elt.addEventListener("pointercancel", endDrag);

	// ---- clicks and drags on the panel canvas: colour boxes and the pattern editor ----
	panelCanvasEl.addEventListener("pointerdown", e => {
		let px = e.offsetX;
		let py = e.offsetY;
		if (locked) return; // no colour changes or painting while tracking

		for (let i = 0; i < colourBoxes.length; i++) {
			let b = colourBoxes[i];
			if (px > b.x && px < b.x + colourBoxSize && py > b.y && py < b.y + colourBoxSize) {
				if (e.shiftKey) {
					editingBox = i;
					picker.value(b.colour); // display current colour
					picker.elt.showPicker();
					return;
				}
				for (let j = 0; j < colourBoxes.length; j++) colourBoxes[j].selected = false;
				b.selected = true;
				currentColour = i;
				return;
			}
		}

		painting = true;
		panelCanvasEl.setPointerCapture(e.pointerId);
		paintAt(px, py);
	});
	panelCanvasEl.addEventListener("pointermove", e => {
		if (painting) paintAt(e.offsetX, e.offsetY);
	});
	panelCanvasEl.addEventListener("pointerup", () => painting = false);
	panelCanvasEl.addEventListener("pointercancel", () => painting = false);
}

// keep the window on screen and move it to panelX / panelY
function applyPanelPos() {
	let viewW = document.documentElement.clientWidth;
	let viewH = document.documentElement.clientHeight;
	let w = panelDiv.elt.offsetWidth || drawWindowWidth;
	panelX = constrain(panelX, 0, max(0, viewW - w));
	panelY = constrain(panelY, 0, max(0, viewH - titleH - 2)); // title bar always reachable
	panelDiv.style("left", panelX + "px");
	panelDiv.style("top", panelY + "px");
	// contents scroll if the window doesn't fit below its current position
	panelScroll.style("max-height", max(60, viewH - panelY - titleH - 4) + "px");
}

function draw() {
	// autosave about twice a second (only writes if something changed)
	if (frameCount % 30 == 0) saveSession();

	if (imageChanged) {
		buildTile();
		imageChanged = false;
	}

	background(200);

	push();
	// white behind the piece: whited-out stitches are simply left undrawn
	noStroke();
	fill(255);
	rect(rulerSize, rulerSize, pieceWidth * bgScale, pieceHeight * bgScale);

	// piece: one rectangle per run, with its stitch count centred in it
	let showCounts = bgScale >= 8; // numbers are unreadable below this
	textAlign(CENTER, CENTER);
	textSize(bgScale * 0.6);

	for (let row = 0; row < pieceHeight; row++) {
		let y = rulerSize + row * bgScale;
		for (let run of pieceRuns[row]) {
			if (run.code == -1) continue;
			let x = rulerSize + run.start * bgScale;
			let w = run.len * bgScale;

			fill(colourBoxes[run.code].colour);
			rect(x, y, w, bgScale);

			let done = doneRuns.has(runKey(row, run.start));
			if (done) drawDoneStripes(x, y, w, bgScale);

			if (showCounts) {
				let tc = textColourFor(run.code);
				fill(tc);
				if (done) {
					// outline the number so it stays readable over the stripes
					stroke(255 - tc);
					strokeWeight(max(2, bgScale * 0.15));
				}
				text(run.len, x + w / 2, y + bgScale / 2);
				noStroke();
			}
		}
	}
	drawRulers();
	pop();

	if (windowOpen) drawPanel(pg);
}

// everything drawn inside the editor window, onto its own canvas g
function drawPanel(g) {
	g.background(240);
	g.push();
	g.fill(0);
	g.noStroke();
	// (labels are DOM elements, made in createPanelLabels(), so they stay sharp)
	for (let i = 0; i < colourBoxes.length; i++) {
		colourBoxes[i].display(g);
	}
	if (locked) {
		// grey out the colour boxes
		g.fill(240, 170);
		g.rect(drawWindowWidth - 74, 136, 58, 58);
		g.fill(0);
	}

	// lighter box behind all of the camo generator controls
	g.push();
	let gx = colB() - knitSliderW - 10;
	g.fill(250);
	g.stroke(180);
	g.strokeWeight(1);
	g.rect(gx, camoGroupTop, colA() + 10 - gx, camoGroupBottom() - camoGroupTop);
	g.pop();

	drawKnitLabels(g);

	// pattern editor
	g.push();
	g.translate(margin, margin);
	g.fill(240);
	g.strokeWeight(1);
	g.stroke(0);
	g.rect(0, 0, pixelWidth * pixelScale, pixelHeight * pixelScale);

	g.noStroke();
	for (let y = 0; y < pixelHeight; y++) {
		for (let x = 0; x < pixelWidth; x++) {
			if (pixelGrid[y][x] == -1) continue;
			g.fill(colourBoxes[pixelGrid[y][x]].colour);
			g.rect(x * pixelScale, y * pixelScale, pixelScale, pixelScale);
		}
	}

	g.stroke(150, 50);
	for (let y = 1; y < pixelHeight; y++) {
		g.line(0, y * pixelScale, pixelWidth * pixelScale, y * pixelScale);
	}
	for (let x = 1; x < pixelWidth; x++) {
		g.line(x * pixelScale, 0, x * pixelScale, pixelHeight * pixelScale);
	}

	// grey out the editor while locked
	if (locked) {
		g.noStroke();
		g.fill(240, 150);
		g.rect(0, 0, pixelWidth * pixelScale, pixelHeight * pixelScale);
	}
	g.pop();

	g.pop();
}

function niceStep(minSpacing, cell) {
	for (let s of [1, 2, 5, 10, 20, 50, 100]) {
		if (s * cell >= minSpacing) return s;
	}
	return 200;
}

function drawRulers() {
	let x0 = rulerSize; // piece's left edge
	let y0 = rulerSize; // piece's top edge
	let pw = pieceWidth * bgScale;
	let ph = pieceHeight * bgScale;

	push();

	// ruler strips
	noStroke();
	fill(245);
	rect(0, 0, pw + 2 * rulerSize, rulerSize); // top
	rect(0, y0 + ph, pw + 2 * rulerSize, rulerSize); // bottom
	rect(0, y0, rulerSize, ph); // left
	rect(x0 + pw, y0, rulerSize, ph); // right

	let ts = constrain(bgScale * 0.7, 8, 12);
	textSize(ts);
	textAlign(CENTER, CENTER);

	// label spacing: wide enough for the longest number, then rounded to 1, 2, 5, 10...
	let colStep = niceStep(textWidth(str(pieceWidth)) + 6, bgScale);
	let rowStep = niceStep(ts + 4, bgScale);

	stroke(0);
	strokeWeight(1);

	// column numbers: 1 at the right edge, counting leftward
	for (let c = 0; c < pieceWidth; c++) {
		let n = pieceWidth - c;
		if (n % colStep != 0 && !(n == 1 && colStep >= 5)) continue;
		let x = x0 + (c + 0.5) * bgScale;
		line(x, y0 - 4, x, y0); // top tick
		line(x, y0 + ph, x, y0 + ph + 4); // bottom tick
		noStroke();
		fill(0);
		text(n, x, y0 / 2 - 2);
		text(n, x, y0 + ph + rulerSize / 2 + 2);
		stroke(0);
	}

	// row numbers: 1 at the lowest row that still has stitches, counting upward
	for (let r = 0; r <= lastKnitRow; r++) {
		let n = lastKnitRow - r + 1;
		if (n % rowStep != 0 && !(n == 1 && rowStep >= 5)) continue;
		let y = y0 + (r + 0.5) * bgScale;
		line(x0 - 4, y, x0, y); // left tick
		line(x0 + pw, y, x0 + pw + 4, y); // right tick
		noStroke();
		fill(0);
		text(n, x0 / 2 - 2, y);
		text(n, x0 + pw + rulerSize / 2 + 2, y);
		stroke(0);
	}

	pop();
}

// unique key for a run: its row and starting column
function runKey(row, start) {
	return row + ":" + start;
}

// which run (if any) is at this canvas position?
function runAt(px, py) {
	let col = floor((px - rulerSize) / bgScale);
	let row = floor((py - rulerSize) / bgScale);
	if (col < 0 || col >= pieceWidth || row < 0 || row >= pieceHeight) return null;
	for (let run of pieceRuns[row]) {
		if (col >= run.start && col < run.start + run.len) return {
			row: row,
			run: run
		};
	}
	return null;
}

// mark or unmark a run; marking locks the pattern
function toggleRun(row, run) {
	let key = runKey(row, run.start);
	if (doneRuns.has(key)) {
		doneRuns.delete(key);
	} else {
		doneRuns.add(key);
		if (!locked) setLocked(true);
	}

	// log in knitting terms: rows from the bottom, stitches from the right
	let first = pieceWidth - run.start - run.len + 1;
	let last = pieceWidth - run.start;
	console.log(`row ${lastKnitRow - row + 1}, stitches ${first}–${last} (${run.len}): ` +
		`${doneRuns.has(key) ? "marked" : "unmarked"} · ${doneRuns.size} runs marked`);

	saveSession(); // save marks immediately, don't wait for the autosave
}

// white / gap / black / gap diagonal stripes over a marked run
function drawDoneStripes(x, y, w, h) {
	let sp = max(3, bgScale / 2); // horizontal distance between stripe slots
	let sw = sp / sqrt(2); // stripe thickness, equal to the gaps at 45°

	push();
	// clip so the stripes stay inside the run
	drawingContext.save();
	drawingContext.beginPath();
	drawingContext.rect(x, y, w, h);
	drawingContext.clip();

	strokeWeight(sw);
	strokeCap(SQUARE);

	// stripes are the lines x + y = k * sp, so they line up across neighbouring runs
	let kStart = floor((x + y) / sp) - 1;
	let kEnd = ceil((x + w + y + h) / sp) + 1;
	for (let k = kStart; k <= kEnd; k++) {
		let slot = ((k % 4) + 4) % 4; // 0 white, 1 gap, 2 black, 3 gap
		if (slot == 1 || slot == 3) continue;
		stroke(slot == 0 ? 255 : 0);
		let s = k * sp;
		line(s - (y + h), y + h, s - y, y);
	}

	drawingContext.restore();
	pop();
}

// make the canvas at least as big as the viewport, and bigger if the piece needs it
// make the canvas at least as big as the viewport, and bigger if the piece needs it
function updateCanvasSize() {
	// while the window is open, leave room on the right so the piece can be scrolled out from under it
	let extra = (windowOpen && panelDiv) ? panelDiv.elt.offsetWidth + 2 * margin : 0;

	// run twice: a scrollbar appearing shrinks the viewport, which can change the result
	for (let i = 0; i < 2; i++) {
		let viewW = document.documentElement.clientWidth; // excludes scrollbars
		let viewH = document.documentElement.clientHeight;
		let w = max(viewW, pieceWidth * bgScale + 2 * rulerSize + extra);
		let h = max(viewH, pieceHeight * bgScale + 2 * rulerSize);
		if (w != width || h != height) resizeCanvas(w, h);
	}
}

function windowResized() {
	updateCanvasSize();
	applyPanelPos(); // pull the window back on screen if the browser got smaller
}

function placeWindowButton() {
	if (windowOpen) {
		// inside the editor window, bottom row
		windowButton.style("right", "auto");
		windowButton.style("bottom", "auto");
		placeBtn(windowButton, 1, 2);
	} else {
		// floats in the bottom-right corner of the screen
		windowButton.parent(document.body);
		windowButton.style("position", "fixed");
		windowButton.style("left", "auto");
		windowButton.style("top", "auto");
		windowButton.style("right", "10px");
		windowButton.style("bottom", "10px");
	}
}

function toggleWindow() {
	windowOpen = !windowOpen;
	if (windowOpen) panelDiv.show();
	else panelDiv.hide();
	windowButton.html(windowOpen ? "close editor window" : "open window");
	placeWindowButton();
	if (windowOpen) applyPanelPos();
	updateCanvasSize();
}

// lock or unlock every pattern-changing control
function setLocked(state) {
	locked = state;
	for (let el of lockableUI) {
		// p5 checkboxes are a <div> wrapping the real <input>; other elements are the input itself
		let target = el.elt.querySelector("input") || el.elt;
		target.disabled = locked;
	}
	updateResetButton();
	updateHistoryButtons();
	saveSession();
}

// show "lock in pattern" while unlocked, "reset tracking" while locked (window open only)
// show "lock in pattern" while unlocked, "reset tracking" while locked
function updateResetButton() {
	if (locked) {
		lockButton.hide();
		resetButton.show();
		lockWarning.show();
	} else {
		lockButton.show();
		resetButton.hide();
		lockWarning.hide();
	}
	// fade the colour box numbers along with the boxes' grey overlay
	for (let el of colourBoxLabels) el.style("opacity", locked ? "0.35" : "1");
}

function resetTracking() {
	let n = doneRuns.size;
	if (n == 0) {
		setLocked(false); // nothing to lose, so no warning needed
		return;
	}
	let ok = confirm(`Reset stitch tracking? This will discard ${n} marked run${n == 1 ? "" : "s"} and unlock editing.`);
	if (!ok) return;
	doneRuns.clear();
	setLocked(false);
}

// clicks on the piece: click marks a run (window closed), shift-click / shift-drag whites out stitches
// (the editor window handles its own clicks)
function mousePressed(event) {
	if (!event || event.target !== mainCanvas) return;
	let cell = pieceCellAt(mouseX, mouseY);
	if (!cell) return;

	if (event.shiftKey) {
		// shaping works any time, even mid-knit; marks in the row are kept or trimmed
		whiteDrag = removedStitches.has(stitchKey(cell.row, cell.col)) ? "restore" : "remove";
		applyWhiteout(cell);
		return;
	}

	// marking runs only while the editor window is closed
	let hit = runAt(mouseX, mouseY);
	if (hit && !windowOpen) toggleRun(hit.row, hit.run);
}

function mouseDragged() {
	if (!whiteDrag) return;
	let cell = pieceCellAt(mouseX, mouseY);
	if (cell) applyWhiteout(cell);
}

function mouseReleased() {
	if (whiteDrag) {
		whiteDrag = null;
		saveSession();
	}
}

// which piece stitch (if any) is at this canvas position?
function pieceCellAt(px, py) {
	let col = floor((px - rulerSize) / bgScale);
	let row = floor((py - rulerSize) / bgScale);
	if (col < 0 || col >= pieceWidth || row < 0 || row >= pieceHeight) return null;
	return { col: col, row: row };
}

function stitchKey(row, col) {
	return row + ":" + col;
}

// white out or restore one stitch, keeping knitted marks in that row
function applyWhiteout(cell) {
	let key = stitchKey(cell.row, cell.col);
	let had = removedStitches.has(key);
	if (whiteDrag == "remove" && !had) removedStitches.add(key);
	else if (whiteDrag == "restore" && had) removedStitches.delete(key);
	else return; // nothing changed

	rebuildRowKeepingMarks(cell.row);
	updateLastKnitRow();
}

// recompute one row's runs after white-out changes, keeping its knitted marks
function rebuildRowKeepingMarks(row) {
	// which stitches in this row were knitted (part of a marked run)?
	let knitted = new Set();
	for (let run of pieceRuns[row]) {
		let k = runKey(row, run.start);
		if (doneRuns.has(k)) {
			for (let c = run.start; c < run.start + run.len; c++) knitted.add(c);
			doneRuns.delete(k);
		}
	}

	// rebuild this row's runs around the change
	pieceRuns[row] = computeRowRuns(row);

	// re-mark every new run made up entirely of knitted stitches
	// (a restored stitch counts as not knitted, so a run it joins comes back unmarked)
	for (let run of pieceRuns[row]) {
		let allKnitted = true;
		for (let c = run.start; c < run.start + run.len; c++) {
			if (!knitted.has(c)) {
				allKnitted = false;
				break;
			}
		}
		if (allKnitted) doneRuns.add(runKey(row, run.start));
	}
}

// "reset white tiles": restore every whited-out stitch (allowed while locked, like white-out)
function resetWhiteout() {
	let n = removedStitches.size;
	if (n == 0) return;
	let ok = confirm(`Restore ${n} whited-out stitch${n == 1 ? "" : "es"}? Restored stitches count as not knitted.`);
	if (!ok) return;

	// only rows that had whited-out stitches can change
	let rows = new Set([...removedStitches].map(k => Number(k.split(":")[0])));
	removedStitches.clear();
	for (let row of rows) {
		if (row < pieceRuns.length) rebuildRowKeepingMarks(row);
	}
	updateLastKnitRow();
	saveSession();
}

// drop whited-out stitches that fall outside the piece after a size change
function pruneRemoved() {
	removedStitches = new Set([...removedStitches].filter(k => {
		let [r, c] = k.split(":").map(Number);
		return r < pieceHeight && c < pieceWidth;
	}));
}

// set the pattern scale, kept within the scale input's min / max
function setScale(v) {
	let lo = int(scaleInput.attribute("min"));
	let hi = int(scaleInput.attribute("max"));
	bgScale = constrain(v, lo, hi);
	scaleInput.value(bgScale);
	updateCanvasSize();
}

function keyPressed() {
	// Escape opens / closes the editor window (but if the help dialog is open, it just closes that)
	if (key == "Escape") {
		if (!helpDialog.elt.open) toggleWindow();
		return;
	}

	// ignore shortcuts while typing in a text or number field
	let el = document.activeElement;
	if (el && el.tagName == "INPUT" && el.type != "range" && el.type != "checkbox") return;

	if (key == '-' || key == '_') {
		setScale(bgScale - 1); // zoom out
	} else if (key == '=' || key == '+') {
		setScale(bgScale + 1); // zoom in
	}
}

function saveTile() {
	buildTile();
	saveCanvas(tile.elt, "tile", "png");
}

function buildTile() {
	if (tile) {
		tile.remove();
	}

	tile = createGraphics(pixelWidth, pixelHeight);

	tile.pixelDensity(1);
	tile.noSmooth();
	tile.noStroke();

	for (let y = 0; y < pixelHeight; y++) {
		for (let x = 0; x < pixelWidth; x++) {
			let colourCode = pixelGrid[y][x];
			tile.fill(colourBoxes[colourCode].colour);
			tile.rect(x, y, 1, 1);
		}
	}

}

// paint the editor cell at panel position (px, py)
function paintAt(px, py) {
	if (locked) return;

	// which editor cell is under the pointer?
	let x = floor((px - margin) / pixelScale);
	let y = floor((py - margin) / pixelScale);

	// ignore points outside the editor grid
	if (x < 0 || x >= pixelWidth || y < 0 || y >= pixelHeight) return;

	// only redraw and recalculate if the cell actually changes
	if (pixelGrid[y][x] == currentColour) return;

	pixelGrid[y][x] = currentColour;
	imageChanged = true;
	computeRuns();
}

// "fill with selected colour": the whole 52x52 grid, so enlarging the pattern later
// doesn't uncover old cells
function fillPattern() {
	if (locked) return;
	for (let y = 0; y < 52; y++) {
		for (let x = 0; x < 52; x++) {
			pixelGrid[y][x] = currentColour;
		}
	}
	imageChanged = true;
	computeRuns();
}

class ColourBox {
	constructor(colour, id, x, y) {
		this.colour = colour;
		this.id = id;
		this.selected = false;
		this.x = x;
		this.y = y;
	}

	display(g) {
		g.push();
		if (this.selected) {
			g.stroke(0);
			g.strokeWeight(1);
		} else {
			g.noStroke();
		}
		g.fill(this.colour);
		g.rect(this.x, this.y, colourBoxSize, colourBoxSize);
		g.pop(); // (the number on top is a DOM label, see createPanelLabels())
	}
}

function generateCamo(iterations = 5, radius = 1) {
	let w = pixelWidth;
	let h = pixelHeight;
	let n = colourBoxes.length;

	// 1. random start
	let grid = [];
	for (let y = 0; y < h; y++) {
		grid[y] = [];
		for (let x = 0; x < w; x++) {
			grid[y][x] = floor(random(n));
		}
	}

	// 2. smoothing passes: each cell takes the most common neighbouring colour
	for (let it = 0; it < iterations; it++) {
		let next = [];
		for (let y = 0; y < h; y++) {
			next[y] = [];
			for (let x = 0; x < w; x++) {
				let counts = new Array(n).fill(0);
				for (let dy = -radius; dy <= radius; dy++) {
					for (let dx = -radius; dx <= radius; dx++) {
						// wrap around edges so the pattern tiles seamlessly
						let c = grid[(y + dy + h) % h][(x + dx + w) % w];
						counts[c]++;
					}
				}
				// keep the current colour unless another one clearly wins
				let best = grid[y][x];
				for (let c = 0; c < n; c++) {
					if (counts[c] > counts[best]) best = c;
				}
				next[y][x] = best;
			}
		}
		grid = next;
	}

	// 3. copy into the real grid
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			pixelGrid[y][x] = grid[y][x];
		}
	}
	imageChanged = true;
	computeRuns();
}

function generateCamoAlternate({
	blockSize = 2, // size of the starting clusters (2 or 3 works well)
	iterations = 2, // smoothing passes; fewer means more jagged edges
	radiusX = 2, // horizontal neighbourhood; larger than radiusY stretches patches sideways
	radiusY = 1, // vertical neighbourhood
	jitter = 0.04, // share of boundary cells roughened afterwards (0 turns it off)
	maxTries = 10 // retries if a colour goes missing
} = {}) {
	let w = pixelWidth;
	let h = pixelHeight;
	let n = colourBoxes.length;
	let grid;

	for (let attempt = 0; attempt < maxTries; attempt++) {

		// 1. blocky random seed
		let bw = ceil(w / blockSize);
		let bh = ceil(h / blockSize);
		let seed = [];
		for (let by = 0; by < bh; by++) {
			seed[by] = [];
			for (let bx = 0; bx < bw; bx++) {
				seed[by][bx] = floor(random(n));
			}
		}
		grid = [];
		for (let y = 0; y < h; y++) {
			grid[y] = [];
			for (let x = 0; x < w; x++) {
				grid[y][x] = seed[floor(y / blockSize)][floor(x / blockSize)];
			}
		}

		// 2. majority-vote smoothing with wraparound (keeps the tile seamless)
		for (let it = 0; it < iterations; it++) {
			let next = [];
			for (let y = 0; y < h; y++) {
				next[y] = [];
				for (let x = 0; x < w; x++) {
					let counts = new Array(n).fill(0);
					for (let dy = -radiusY; dy <= radiusY; dy++) {
						for (let dx = -radiusX; dx <= radiusX; dx++) {
							counts[grid[(y + dy + h) % h][(x + dx + w) % w]]++;
						}
					}
					let best = grid[y][x];
					for (let c = 0; c < n; c++) {
						if (counts[c] > counts[best]) best = c;
					}
					next[y][x] = best;
				}
			}
			grid = next;
		}

		// 3. roughen edges: some boundary cells take a neighbour's colour
		if (jitter > 0) {
			let dirs = [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1]
			];
			let next = grid.map(row => row.slice());
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					if (random() > jitter) continue;
					let d = random(dirs);
					let nc = grid[(y + d[1] + h) % h][(x + d[0] + w) % w];
					if (nc != grid[y][x]) next[y][x] = nc; // only changes cells on a boundary
				}
			}
			grid = next;
		}

		// 4. check that every colour appears; if not, try again
		let present = new Set(grid.flat());
		if (present.size == n) break;
	}

	// 5. copy into the real grid
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			pixelGrid[y][x] = grid[y][x];
		}
	}
	imageChanged = true;
	computeRuns();
}

function camo() {
	if (knitMode == true) {
		setCamoStatus("generating...");
		generating = true;
		camoButton.elt.disabled = true; // no double clicks while it runs
		updateHistoryButtons();
		// generation blocks the page, so wait for the browser to show "generating..." first
		// (two frames: the first schedules the paint, the second runs after it)
		requestAnimationFrame(() => requestAnimationFrame(() => {
			let ok = generateCamoKnit(getKnitSettings());
			setCamoStatus(ok ? "" : "failed! try different settings", !ok);
			if (ok) {
				// new patterns always go on the end, so nothing earlier is lost
				camoHistory.push({ w: pixelWidth, h: pixelHeight, grid: pixelGrid.map(r => r.slice()), starred: false });
				camoIndex = camoHistory.length - 1;
			}
			generating = false;
			camoButton.elt.disabled = locked;
			updateHistoryButtons();
		}));
		return;
	}
	let rand = Math.floor(random(2));
	if (rand == 0) {
		generateCamo();
	} else {
		generateCamoAlternate();
	}
}

// show entry i of camoHistory, including the pattern size it was made at
function showCamo(i) {
	if (locked || generating || i < 0 || i >= camoHistory.length) return;
	camoIndex = i;
	let entry = camoHistory[i];
	for (let y = 0; y < 52; y++) {
		for (let x = 0; x < 52; x++) pixelGrid[y][x] = entry.grid[y][x];
	}
	pixelWidth = entry.w;
	pixelHeight = entry.h;
	widthInput.value(pixelWidth);
	heightInput.value(pixelHeight);
	setCamoStatus("");
	imageChanged = true;
	computeRuns();
	updateHistoryButtons();
}

// star or unstar the pattern that's showing
function toggleStar() {
	let entry = camoHistory[camoIndex];
	if (!entry || generating) return;
	entry.starred = !entry.starred;
	updateHistoryButtons();
}

// grey out an arrow at the oldest / newest pattern, while locked, or while generating;
// show the star filled or empty for the pattern that's showing
function updateHistoryButtons() {
	if (!prevCamoButton) return; // not created yet
	let off = locked || generating;
	prevCamoButton.elt.disabled = off || camoIndex <= 0;
	nextCamoButton.elt.disabled = off || camoIndex >= camoHistory.length - 1;

	// starring doesn't change the pattern, so it stays available while locked
	let entry = camoHistory[camoIndex];
	starCamoButton.elt.disabled = generating || !entry;
	let starred = entry && entry.starred;
	starCamoButton.html(starred ? "\u2605" : "\u2606");
	starCamoButton.style("color", starred ? "#c99506" : "");
}

// status text under the "generate camo" button (red for errors)
function setCamoStatus(msg, isError = false) {
	camoStatus.html(msg);
	camoStatus.style("color", isError ? "rgb(180, 0, 0)" : "#000");
}

// function generateCamoKnit({
// 	maxVertical = 3,      // a colour can't run more than this many cells down a column
// 	maxGap = 10,           // hard rule: every window this wide contains every colour
// 	idealGap = 8,         // soft goal: every window this wide contains every colour
// 	leftWeight = 4,       // clumping: favour the colour to the left
// 	upWeight = 2,         // clumping: favour the colour above
// 	palette = [1, 2, 3],  // which palette colours to use
// 	diagWeight = 3,       // clumping: favour the colour diagonally above (diagonal flow)
// 	diagDir = random([-1, 1]), // 1 = diagonals run down-right, -1 = down-left
// 	overdueBoost = 8,     // how strongly to push colours that are close to breaking the ideal gap
// 	attempts = 40         // full patterns tried; the best one is kept
// } = {}) {
// 	let w = pixelWidth;
// 	let h = pixelHeight;
// 	let n = palette.length;

// 	if (w < n) {
// 		console.warn("pattern is too narrow to fit every colour in each row");
// 		return;
// 	}

// 	// does colour c at (x, y) break either hard rule, given the cells filled so far?
// 	function fits(grid, x, y, c) {
// 		// vertical run length, counting up and down with wraparound
// 		let run = 1;
// 		for (let k = 1; k < h; k++) {
// 			if (grid[(y - k + h) % h][x] === c) run++;
// 			else break;
// 		}
// 		for (let k = 1; k < h; k++) {
// 			if (grid[(y + k) % h][x] === c) run++;
// 			else break;
// 		}
// 		if (run > maxVertical) return false;

// 		// every horizontal window containing x must still be able to fit all colours
// 		let L = min(maxGap, w);
// 		for (let s = 0; s < L; s++) {
// 			let present = new Array(n).fill(false);
// 			let empty = 0;
// 			for (let k = 0; k < L; k++) {
// 				let xx = (x - s + k + w * 2) % w;
// 				let v = xx == x ? c : grid[y][xx];
// 				if (v === null) empty++;
// 				else present[v] = true;
// 			}
// 			let missing = present.filter(p => !p).length;
// 			if (missing > empty) return false;
// 		}
// 		return true;
// 	}

// 	// has colour c appeared in the last k cells to the left?
// 	function seenRecently(row, x, c, k) {
// 		for (let i = 1; i <= k; i++) {
// 			if (row[(x - i + w) % w] === c) return true;
// 		}
// 		return false;
// 	}

// 	function buildAttempt() {
// 		let grid = Array.from({ length: h }, () => Array(w).fill(null));

// 		for (let y = 0; y < h; y++) {
// 			let rowDone = false;

// 			for (let rowTry = 0; rowTry < 30 && !rowDone; rowTry++) {
// 				grid[y].fill(null);
// 				let failed = false;

// 				for (let x = 0; x < w; x++) {
// 					let weights = [];
// 					for (let c = 0; c < n; c++) {
// 						if (!fits(grid, x, y, c)) {
// 							weights.push(0);
// 							continue;
// 						}
// 						let wt = 1;
// 						if (x > 0 && grid[y][x - 1] === c) wt += leftWeight;
// 						if (y > 0 && grid[y - 1][x] === c) wt += upWeight;
// 						if (y > 0 && grid[y - 1][(x - diagDir + w) % w] === c) wt += diagWeight;
// 						if (!seenRecently(grid[y], x, c, idealGap - 1)) wt *= overdueBoost;
// 						weights.push(wt);
// 					}

// 					// weighted random pick
// 					let total = weights.reduce((a, b) => a + b, 0);
// 					if (total == 0) {
// 						failed = true;
// 						break;
// 					}
// 					let r = random(total);
// 					let pick = 0;
// 					while (r >= weights[pick]) {
// 						r -= weights[pick];
// 						pick++;
// 					}
// 					grid[y][x] = pick;
// 				}
// 				if (!failed) rowDone = true;
// 			}
// 			if (!rowDone) return null; // dead end: start a fresh attempt
// 		}
// 		return grid;
// 	}

// 	// how many windows of a given width are missing at least one colour
// 	function countGapViolations(grid, gap) {
// 		let L = min(gap, w);
// 		let count = 0;
// 		for (let y = 0; y < h; y++) {
// 			for (let s = 0; s < w; s++) {
// 				let seen = new Set();
// 				for (let k = 0; k < L; k++) seen.add(grid[y][(s + k) % w]);
// 				if (seen.size < n) count++;
// 			}
// 		}
// 		return count;
// 	}

// 	// try several times and keep the result closest to the ideal gap
// 	let best = null;
// 	let bestScore = Infinity;
// 	for (let a = 0; a < attempts; a++) {
// 		let g = buildAttempt();
// 		if (!g) continue;
// 		let score = countGapViolations(g, idealGap);
// 		if (score < bestScore) {
// 			best = g;
// 			bestScore = score;
// 		}
// 		if (score == 0) break;
// 	}

// 	if (!best) {
// 		console.warn("couldn't satisfy the knitting constraints; try a larger pattern or looser settings");
// 		return;
// 	}

// 	for (let y = 0; y < h; y++) {
// 		for (let x = 0; x < w; x++) {
// 			pixelGrid[y][x] = palette[best[y][x]];
// 		}
// 	}
// 	imageChanged = true;
// 	console.log(`knit camo: ${bestScore} windows of ${idealGap} are missing a colour`);
// }

function generateCamoKnit({
	palette = [0, 1, 2], // which colour boxes to use
	maxVertical = 3, // hard: max run of one colour down a column
	maxGap = 8, // hard: every window this wide contains every colour
	idealGap = 8, // soft: every window this wide contains every colour
	strictNeighbours = false, // true: hard = same-colour neighbour up/down/left/right
	// false: hard = any same-colour neighbour incl. diagonal, soft = orthogonal
	leftWeight = 15, // clumping: favour the colour to the left
	upWeight = 8, // clumping: favour the colour above
	diagWeight = 4, // clumping: favour the colour diagonally above
	diagDir = random([-1, 1]),
	overdueBoost = 1, // nudge colours close to breaking idealGap
	lonelyBoost = 20, // strongly favour pairing up with an isolated neighbour
	repairPasses = 12,
	attempts = 60,
	timeLimit = 3000 // ms; keeps the best result found in this time
} = {}) {
	const w = pixelWidth;
	const h = pixelHeight;
	const n = palette.length;

	if (w < n) {
		console.warn("pattern is too narrow to fit every colour in each row");
		return false;
	}

	const ORTH = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1]
	];
	const ALL8 = [...ORTH, [1, 1],
		[1, -1],
		[-1, 1],
		[-1, -1]
	];
	const hardDirs = strictNeighbours ? ORTH : ALL8;
	const softDirs = strictNeighbours ? ALL8 : ORTH;

	// read a cell with wraparound (keeps the tile seamless)
	const at = (g, x, y) => g[(y + h) % h][(x + w) % w];

	// length of the vertical run of colour c through (x, y)
	function vertRun(g, x, y, c) {
		let run = 1;
		for (let k = 1; k < h; k++) {
			if (at(g, x, y - k) === c) run++;
			else break;
		}
		for (let k = 1; k < h; k++) {
			if (at(g, x, y + k) === c) run++;
			else break;
		}
		return run;
	}

	// can every maxGap window containing x still hold all colours, with c at x?
	function windowsOK(g, x, y, c) {
		let L = min(maxGap, w);
		for (let s = 0; s < L; s++) {
			let present = new Array(n).fill(false);
			let empty = 0;
			for (let k = 0; k < L; k++) {
				let xx = (x - s + k + w * 2) % w;
				let v = xx == x ? c : g[y][xx];
				if (v === null) empty++;
				else present[v] = true;
			}
			if (present.filter(p => !p).length > empty) return false;
		}
		return true;
	}

	// does (x, y) have a same-coloured neighbour in the given directions?
	function hasLike(g, x, y, dirs) {
		let c = g[y][x];
		for (let d of dirs) {
			if (at(g, x + d[0], y + d[1]) === c) return true;
		}
		return false;
	}

	// ---------- stage 1: generate ----------

	function buildAttempt() {
		let g = Array.from({
			length: h
		}, () => Array(w).fill(null));

		for (let y = 0; y < h; y++) {
			let rowDone = false;

			for (let rowTry = 0; rowTry < 30 && !rowDone; rowTry++) {
				g[y].fill(null);
				let failed = false;

				for (let x = 0; x < w; x++) {
					// is the cell to the left still alone? (only left and up are known so far)
					let lc = x > 0 ? g[y][x - 1] : null;
					let leftLonely = lc !== null &&
						at(g, x - 2, y) !== lc &&
						(y == 0 || g[y - 1][x - 1] !== lc);

					// is the cell above still alone? This cell is its last chance.
					let uc = y > 0 ? g[y - 1][x] : null;
					let upLonely = uc !== null &&
						at(g, x, y - 2) !== uc &&
						at(g, x - 1, y - 1) !== uc &&
						at(g, x + 1, y - 1) !== uc;

					let weights = [];
					for (let c = 0; c < n; c++) {
						if (vertRun(g, x, y, c) > maxVertical || !windowsOK(g, x, y, c)) {
							weights.push(0);
							continue;
						}
						let wt = 1;
						if (c === lc) wt += leftWeight;
						if (c === uc) wt += upWeight;
						if (y > 0 && at(g, x - diagDir, y - 1) === c) wt += diagWeight;
						if (leftLonely && c === lc) wt += lonelyBoost;
						if (upLonely && c === uc) wt += lonelyBoost * 5;

						// soft gap: has c appeared in the last idealGap - 1 cells?
						let seen = false;
						for (let i = 1; i < idealGap; i++) {
							if (at(g, x - i, y) === c) {
								seen = true;
								break;
							}
						}
						if (!seen) wt *= overdueBoost;

						weights.push(wt);
					}

					let total = weights.reduce((a, b) => a + b, 0);
					if (total == 0) {
						failed = true;
						break;
					}
					let r = random(total);
					let pick = 0;
					while (pick < n - 1 && r >= weights[pick]) {
						r -= weights[pick];
						pick++;
					}
					g[y][x] = pick;
				}
				if (!failed) rowDone = true;
			}
			if (!rowDone) return null;
		}
		return g;
	}

	// ---------- stage 2: repair isolated pixels ----------

	// isolation status of the 8 cells around (x, y)
	function isoAround(g, x, y) {
		return ALL8.map(d => {
			let nx = (x + d[0] + w) % w;
			let ny = (y + d[1] + h) % h;
			return !hasLike(g, nx, ny, hardDirs);
		});
	}

	// after changing (x, y), are all hard rules still met and no neighbour newly isolated?
	function changeIsValid(g, x, y, before) {
		let c = g[y][x];
		if (vertRun(g, x, y, c) > maxVertical) return false;
		if (!windowsOK(g, x, y, c)) return false;
		let after = isoAround(g, x, y);
		for (let i = 0; i < after.length; i++) {
			if (!before[i] && after[i]) return false;
		}
		return true;
	}

	// option A: recolour the lone pixel to match one of its neighbours
	function tryRecolour(g, x, y) {
		let old = g[y][x];
		let candidates = new Set(hardDirs.map(d => at(g, x + d[0], y + d[1])));
		candidates.delete(old);
		for (let c of shuffle([...candidates])) {
			let before = isoAround(g, x, y);
			g[y][x] = c;
			if (changeIsValid(g, x, y, before)) return true;
			g[y][x] = old;
		}
		return false;
	}

	// option B: grow a neighbour into the lone pixel's colour
	function tryGrowNeighbour(g, x, y) {
		let c = g[y][x];
		for (let d of shuffle([...hardDirs])) {
			let nx = (x + d[0] + w) % w;
			let ny = (y + d[1] + h) % h;
			let old = g[ny][nx];
			if (old === c) continue;
			let before = isoAround(g, nx, ny);
			g[ny][nx] = c;
			if (changeIsValid(g, nx, ny, before)) return true;
			g[ny][nx] = old;
		}
		return false;
	}

	function repair(g) {
		for (let pass = 0; pass < repairPasses; pass++) {
			let remaining = 0;
			let fixed = 0;
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					if (hasLike(g, x, y, hardDirs)) continue;
					remaining++;
					if (tryRecolour(g, x, y) || tryGrowNeighbour(g, x, y)) fixed++;
				}
			}
			if (remaining == 0) return true;
			if (fixed == 0) break;
		}
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				if (!hasLike(g, x, y, hardDirs)) return false;
			}
		}
		return true;
	}

	// ---------- scoring (soft goals) ----------

	function softScore(g) {
		let score = 0;
		let L = min(idealGap, w);
		for (let y = 0; y < h; y++) {
			for (let s = 0; s < w; s++) {
				let seen = new Set();
				for (let k = 0; k < L; k++) seen.add(g[y][(s + k) % w]);
				if (seen.size < n) score++;
			}
			for (let x = 0; x < w; x++) {
				if (!hasLike(g, x, y, softDirs)) score += 2;
			}
		}
		return score;
	}

	// ---------- search ----------

	let best = null;
	let bestScore = Infinity;
	let start = millis();

	for (let a = 0; a < attempts; a++) {
		let g = buildAttempt();
		if (g && repair(g)) {
			let score = softScore(g);
			if (score < bestScore) {
				best = g;
				bestScore = score;
			}
			if (score == 0) break;
		}
		if (millis() - start > timeLimit) break;
	}

	if (!best) {
		console.warn("couldn't satisfy all hard rules; try a longer timeLimit, a bigger pattern or looser settings");
		return false;
	}

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			pixelGrid[y][x] = palette[best[y][x]];
		}
	}
	imageChanged = true;
	computeRuns();
	console.log(`knit camo: soft score ${bestScore} (0 = every soft goal met)`);
	return true;
}

// ---------- knit camo controls ----------

// right edge (panel coordinates) of grid cell i: even cells in the left column, odd in the right
function knitCellRight(i) {
	return i % 2 == 0 ? drawWindowWidth - 20 - knitColGap : drawWindowWidth - 20;
}

// top (panel coordinates) of grid cell i
function knitCellTop(i) {
	return knitGridTop + floor(i / 2) * knitRowH;
}

function createKnitControls() {
	const sliderDefs = [{
			key: "maxVertical",
			label: "max vertical run",
			min: 2,
			max: 8,
			value: 3,
			step: 1
		},
		{
			key: "maxGap",
			label: "max gap (hard)",
			min: 3,
			max: 16,
			value: 8,
			step: 1
		},
		{
			key: "idealGap",
			label: "ideal gap (soft)",
			min: 3,
			max: 16,
			value: 8,
			step: 1
		},
		{
			key: "leftWeight",
			label: "left weight",
			min: 0,
			max: 40,
			value: 15,
			step: 1
		},
		{
			key: "upWeight",
			label: "up weight",
			min: 0,
			max: 40,
			value: 8,
			step: 1
		},
		{
			key: "diagWeight",
			label: "diagonal weight",
			min: 0,
			max: 40,
			value: 4,
			step: 1
		},
		{
			key: "overdueBoost",
			label: "overdue boost",
			min: 1,
			max: 10,
			value: 1,
			step: 0.5
		},
		{
			key: "lonelyBoost",
			label: "lonely boost",
			min: 0,
			max: 50,
			value: 20,
			step: 1
		},
		{
			key: "repairPasses",
			label: "repair passes",
			min: 0,
			max: 30,
			value: 12,
			step: 1
		},
		{
			key: "attempts",
			label: "attempts",
			min: 1,
			max: 200,
			value: 60,
			step: 1
		},
		{
			key: "timeLimit",
			label: "time limit (ms)",
			min: 100,
			max: 5000,
			value: 3000,
			step: 100
		}
	];

	let cells = [{
			type: "palette",
			label: "colours used"
		},
		{
			type: "checkbox",
			key: "strictNeighbours",
			label: "strict neighbours",
			value: false
		},
		{
			type: "select",
			key: "diagDir",
			label: "diagonal direction"
		}
	];
	for (let d of sliderDefs) cells.push({
		type: "slider",
		...d
	});

	cells.forEach((cell, i) => {
		let right = knitCellRight(i);
		let top = knitCellTop(i);
		let sx = right - knitSliderW; // panel coordinates
		let sy = top + 16;
		cell.labelEl = panelLabel(cell.label, right, top + 12);

		if (cell.type == "slider") {
			cell.el = createSlider(cell.min, cell.max, cell.value, cell.step);
			placeUI(cell.el, sx, sy);
			cell.el.size(knitSliderW);
		} else if (cell.type == "checkbox") {
			cell.el = createCheckbox("", cell.value);
			placeUI(cell.el, right - 20, sy);
		} else if (cell.type == "select") {
			cell.el = createSelect();
			cell.el.option("random");
			cell.el.option("down-right");
			cell.el.option("down-left");
			placeUI(cell.el, sx, sy);
			cell.el.size(knitSliderW);
		} else if (cell.type == "palette") {
			cell.els = [];
			for (let c = 0; c < colourBoxes.length; c++) {
				let cb = createCheckbox("", c < 3); // default: colours 0, 1, 2
				placeUI(cb, sx + c * 35, sy);
				cell.els.push(cb);
			}
		}
	});

	knitControls = cells;
}

// palette swatches drawn onto the panel canvas g, and slider values kept up to date
// in the DOM labels (checked every frame, so loaded sessions update too)
function drawKnitLabels(g) {
	g.push();
	g.noStroke();
	knitControls.forEach((cell, i) => {
		let right = knitCellRight(i);
		let top = knitCellTop(i);
		let label = cell.label;
		if (cell.type == "slider") label += ": " + cell.el.value();
		if (cell.labelEl.elt.textContent != label) cell.labelEl.html(label);

		if (cell.type == "palette") {
			for (let c = 0; c < cell.els.length; c++) {
				g.fill(colourBoxes[c].colour);
				g.rect(right - knitSliderW + c * 35 + 20, top + 18, 12, 12);
			}
		}
	});
	g.pop();
}

// read every control into a settings object for generateCamoKnit()
function getKnitSettings() {
	let s = {};
	for (let cell of knitControls) {
		if (cell.type == "slider") {
			s[cell.key] = Number(cell.el.value());
		} else if (cell.type == "checkbox") {
			s[cell.key] = cell.el.checked();
		} else if (cell.type == "select") {
			let v = cell.el.value();
			if (v == "down-right") s.diagDir = 1;
			else if (v == "down-left") s.diagDir = -1;
			// "random": leave it unset so the generator picks one
		} else if (cell.type == "palette") {
			s.palette = [];
			cell.els.forEach((cb, c) => {
				if (cb.checked()) s.palette.push(c);
			});
		}
	}
	if (s.palette.length < 2) {
		console.warn("pick at least two colours; using 0, 1 and 2");
		s.palette = [0, 1, 2];
	}
	return s;
}

function pieceCode(col, row) {
	return pixelGrid[row % pixelHeight][col % pixelWidth];
}

// split every row of the piece into runs of the same colour
// split every row of the piece into runs of the same colour
function computeRuns() {
	pieceRuns = [];
	for (let row = 0; row < pieceHeight; row++) {
		pieceRuns.push(computeRowRuns(row));
	}
	updateLastKnitRow();
}

// runs in one row: a run ends where the colour changes, at a whited-out stitch, or at the row's end
function computeRowRuns(row) {
	let runs = [];
	let col = 0;
	while (col < pieceWidth) {
		if (removedStitches.has(stitchKey(row, col))) {
			col++; // whited out: not part of any run
			continue;
		}
		let start = col;
		let code = pieceCode(col, row);
		col++;
		while (col < pieceWidth && !removedStitches.has(stitchKey(row, col)) && pieceCode(col, row) == code) {
			col++;
		}
		runs.push({
			start: start,
			len: col - start,
			code: code
		});
	}
	return runs;
}

// the lowest row that still has at least one stitch is row 1 on the rulers
function updateLastKnitRow() {
	lastKnitRow = -1;
	for (let r = pieceRuns.length - 1; r >= 0; r--) {
		if (pieceRuns[r].length > 0) {
			lastKnitRow = r;
			break;
		}
	}
}

// black text on light stitches, white on dark
function textColourFor(code) {
	let hex = colourBoxes[code].colour;
	if (!(hex in textColourCache)) {
		let c = color(hex);
		let lum = 0.299 * red(c) + 0.587 * green(c) + 0.114 * blue(c);
		textColourCache[hex] = lum > 140 ? 0 : 255;
	}
	return textColourCache[hex];
}

// ---------- session saving (localStorage) ----------

// raw values of every knit camo control, keyed like getKnitSettings()
function getKnitControlState() {
	let st = {};
	for (let cell of knitControls) {
		if (cell.type == "slider") st[cell.key] = Number(cell.el.value());
		else if (cell.type == "checkbox") st[cell.key] = cell.el.checked();
		else if (cell.type == "select") st[cell.key] = cell.el.value();
		else if (cell.type == "palette") st.palette = cell.els.map(cb => cb.checked());
	}
	return st;
}

// put saved values back into the knit camo controls (missing values are skipped)
function applyKnitControlState(st) {
	for (let cell of knitControls) {
		if (cell.type == "slider" && st[cell.key] !== undefined) {
			cell.el.value(st[cell.key]);
		} else if (cell.type == "checkbox" && st[cell.key] !== undefined) {
			cell.el.checked(st[cell.key]);
		} else if (cell.type == "select" && st[cell.key] !== undefined) {
			cell.el.selected(st[cell.key]);
		} else if (cell.type == "palette" && st.palette) {
			cell.els.forEach((cb, i) => {
				if (st.palette[i] !== undefined) cb.checked(st.palette[i]);
			});
		}
	}
}

// everything needed to rebuild the session
function getSessionState() {
	return {
		version: 2,
		colours: colourBoxes.map(b => b.colour),
		currentColour: currentColour,
		pattern: {
			width: pixelWidth,
			height: pixelHeight,
			grid: pixelGrid.map(row => row.slice()) // the full 52 x 52 grid
		},
		piece: {
			width: pieceWidth,
			height: pieceHeight
		},
		scale: bgScale,
		knitControls: getKnitControlState(),
		locked: locked,
		doneRuns: [...doneRuns], // runs themselves are rebuilt by computeRuns()
		removed: [...removedStitches], // whited-out stitches, "row:col"
		panel: {
			x: panelX,
			y: panelY
		}
	};
}

function saveSession() {
	if (exporting) return; // the export temporarily changes the scale; don't save that
	if (erasing) return; // the saved session was just erased; the page is reloading
	let json = JSON.stringify(getSessionState());
	if (json === lastSavedJSON) return; // nothing changed
	try {
		localStorage.setItem(SESSION_KEY, json);
		lastSavedJSON = json;
	} catch (e) {
		console.warn("couldn't save the session to localStorage", e);
	}
}

// erase the session saved in this browser (after a warning), then reload with a blank pattern
function eraseLocalData() {
	let ok = confirm("Erase the data saved in this browser? Your pattern, colours, stitch tracking and " +
		"white-out will be lost unless you have saved a piece file. The page will reload with a blank pattern.");
	if (!ok) return;
	erasing = true; // stop the autosave and the save-on-close from writing it straight back
	localStorage.removeItem(SESSION_KEY); // only this tool's key, not other sites' data on the same address
	location.reload();
}

// restore the session saved in this browser; returns true if one was loaded
function loadSession() {
	let json = localStorage.getItem(SESSION_KEY);
	if (!json) return false;
	let s;
	try {
		s = JSON.parse(json);
	} catch (e) {
		console.warn("saved session is unreadable; starting fresh", e);
		return false;
	}
	let ok = applySession(s);
	if (ok) lastSavedJSON = JSON.stringify(getSessionState());
	return ok;
}

// does this look like a session saved by this sketch?
function isValidSession(s) {
	return s && (s.version === 1 || s.version === 2) &&
		Array.isArray(s.colours) &&
		s.pattern && Array.isArray(s.pattern.grid) &&
		s.piece && typeof s.scale == "number";
}

// put a saved session (from localStorage or a file) back into the sketch
function applySession(s) {
	if (!isValidSession(s)) return false;

	try {
		// colours and selected colour
		s.colours.forEach((c, i) => {
			if (colourBoxes[i]) colourBoxes[i].colour = c;
		});
		currentColour = s.currentColour ?? 0;
		colourBoxes.forEach((b, i) => b.selected = (i == currentColour));

		// pattern
		pixelWidth = constrain(int(s.pattern.width), 1, 48);
		pixelHeight = constrain(int(s.pattern.height), 2, 48);
		for (let y = 0; y < pixelGrid.length; y++) {
			for (let x = 0; x < pixelGrid[y].length; x++) {
				let v = s.pattern.grid[y]?.[x];
				if (v !== undefined) pixelGrid[y][x] = v;
			}
		}

		// piece and scale
		pieceWidth = constrain(int(s.piece.width), 1, 999);
		pieceHeight = constrain(int(s.piece.height), 1, 999);
		bgScale = constrain(int(s.scale), 1, 30);

		// show the restored values in the input fields
		widthInput.value(pixelWidth);
		heightInput.value(pixelHeight);
		pieceWidthInput.value(pieceWidth);
		pieceHeightInput.value(pieceHeight);
		scaleInput.value(bgScale);
		applyKnitControlState(s.knitControls || {});

		// whited-out stitches (version 1 saves have none)
		removedStitches = new Set(s.removed || []);
		pruneRemoved();

		// window position, pulled back on screen if needed
		if (s.panel) {
			panelX = s.panel.x;
			panelY = s.panel.y;
			applyPanelPos();
		}

		// rebuild runs and canvas from the restored pattern
		imageChanged = true;
		computeRuns();
		updateCanvasSize();

		// keep only marks that still match a run (guards against stale or edited data)
		let validKeys = new Set();
		pieceRuns.forEach((runs, row) => runs.forEach(r => validKeys.add(runKey(row, r.start))));
		doneRuns = new Set((s.doneRuns || []).filter(k => validKeys.has(k)));

		// lock state follows the session; with marks, close the window to show the piece
		setLocked(!!(s.locked || doneRuns.size > 0));
		if (doneRuns.size > 0 && windowOpen) toggleWindow();

		console.log(`session restored: ${doneRuns.size} marked runs`);
		return true;
	} catch (e) {
		console.warn("session couldn't be restored", e);
		return false;
	}
}

// ---------- piece files and image export ----------

// short date-time stamp for file names, e.g. 2026-11-17-20-30
function fileStamp() {
	return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

// download the session as a JSON file (same data as localStorage)
function savePieceFile() {
	let json = JSON.stringify(getSessionState(), null, 2);
	let blob = new Blob([json], {
		type: "application/json"
	});
	let a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = "knit-piece-" + fileStamp() + ".json";
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// pick a JSON file and load it in place of the current session
function loadPieceFile() {
	let input = document.createElement("input");
	input.type = "file";
	input.accept = ".json,application/json";
	input.onchange = () => {
		let file = input.files[0];
		if (!file) return;
		file.text().then(txt => {
			let s;
			try {
				s = JSON.parse(txt);
			} catch (e) {
				alert("That file isn't a valid piece file.");
				return;
			}
			if (!isValidSession(s)) {
				alert("That file isn't a valid piece file.");
				return;
			}
			if (doneRuns.size > 0 &&
				!confirm(`Loading this file replaces the current piece, including ${doneRuns.size} marked runs. Continue?`)) {
				return;
			}
			if (applySession(s)) saveSession();
			else alert("That file couldn't be loaded.");
		});
	};
	input.click();
}

// save the whole piece (rulers, stitch counts and marked runs, no window) as a PNG
// save the whole piece (rulers, stitch counts and marked runs) as a PNG
function savePieceImage() {
	let oldScale = bgScale;
	exporting = true;

	// large enough for readable stitch counts, small enough for browser canvas limits
	let maxScale = floor((8000 - 2 * rulerSize) / max(pieceWidth, pieceHeight));
	bgScale = max(1, min(max(bgScale, 12), maxScale));
	if (bgScale < 8) console.warn("piece is too large for stitch counts in the image");

	// draw one frame at the export scale and copy the piece area
	updateCanvasSize();
	draw();
	let img = get(0, 0, pieceWidth * bgScale + 2 * rulerSize, pieceHeight * bgScale + 2 * rulerSize);
	save(img, "knit-piece-" + fileStamp() + ".png");

	// put everything back
	bgScale = oldScale;
	updateCanvasSize();
	exporting = false;
}