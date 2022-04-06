/* Start of Canvas Pixel Change */
const canvas = document.getElementById('board');

const ctx = canvas.getContext('2d');

function drawPixel(context, x, y, color) {

    context.fillStyle = color;

    context.fillRect(x,y, 1, 1);

}

canvas.addEventListener('click', printMousePos, true);

function printMousePos(e){

    cursorX = e.offsetX;

    cursorY= e.offsetY;

    drawPixel(ctx, cursorX, cursorY);

}
/* End of Canvas Pixel Change */

/* Start of Color Menu */
var colorWell;
var defaultColor = "#0000ff";
window.addEventListener("load", startup, false);

function startup() {  
    colorWell = document.querySelector("#colorWell");
    colorWell.value = defaultColor;
    colorWell.addEventListener("input", updateFirst, false);
    colorWell.select();
}

function updateFirst(event) {  // changes pixel color to selection
        drawPixel(ctx, cursorX, cursorY, event.target.value);
}
/* End of Color Menu */