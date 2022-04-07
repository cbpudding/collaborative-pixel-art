/* Start of Canvas Pixel Change */
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
function drawPixel(context, x, y, color) {
    context.fillStyle = color;
    context.fillRect(x,y, 5, 5);
}
canvas.addEventListener('click', printMousePos, true);
function printMousePos(e){
    cursorX = e.offsetX;
    cursorY= e.offsetY;
    let tile_x = Math.round(cursorX / 5) * 5;
    let tile_y = Math.round(cursorY / 5) * 5;
    http(`/api/v1/${{x:tile_x,y:tile_y}}`)
    drawPixel(ctx, tile_x, tile_y);
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

function updateFirst(event) {
        drawPixel(ctx, cursorX, cursorY, event.target.value);
}
/* End of Color Menu */

/* a */
function http(api){
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", api, false );
    xmlHttp.send();
    return console.log(xmlHttp.responseText);
}
/* end of a */

/* Full image download for canvas */
download_img = function(el) {
    // get image URI from canvas object
    var imageURI = canvas.toDataURL("image/jpg");
    el.href = imageURI;
};