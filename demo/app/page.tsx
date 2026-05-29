export default function Page() {
    return (
        <div style="width: 100vw; height: 100vh; margin: 0; padding: 0; overflow: hidden; background: #111;">
            <canvas id="gpuCanvas"></canvas>
            <div id="minimap"></div>
            <div id="ui">
                <input type="file" id="folderInput" webkitdirectory directory />
                <div id="info">Select a folder to view files</div>
            </div>
        </div>
    );
}
