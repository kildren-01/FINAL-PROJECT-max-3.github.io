const { app, BrowserWindow } = require('electron');
const { ipcMain } = require('electron');
const { exec } = require('child_process');
const { execSync } = require('child_process');
const { Notification } = require('electron');
const { screen, desktopCapturer } = require('electron');
const { Console } = require('console');

const fs = require('fs');
const path = require('path');
const url = require('url');
const Store = require('electron-store');
const store = new Store();
const webcam = require('node-webcam');
const getPixels = require('get-pixels');
const Jimp = require('jimp');
const colorTemperature = require('color-temperature');
const kelvinToRgb = require('kelvin-to-rgb');
const AutoLaunch = require('auto-launch');


const currentUsername = getCurrentUsername();
const appName = 'bluelight-filter';
const appLauncher = new AutoLaunch({ name: appName });

// Expose the functions to be used in the renderer process
//exports.minimizeWindow = minimizeWindow;
exports.toggleMaximizeWindow = toggleMaximizeWindow;
exports.closeWindow = closeWindow;

const blueLightIcon = path.join(__dirname, 'icons8-light-64.png');
const passwordFile = path.join(__dirname, 'credentials.txt');
const statsConfig = path.join(__dirname, 'statsData.txt');
const settingsConfig = path.join(__dirname, 'settingsConfig.txt');
const filterHtml = path.join(__dirname, 'Blue Light Filter.html');

let currentUser = "";
let ambientLight = 1;
let logInSuccess = false;
let blueActive = false;
let thirdWindow;
let secondWindow;
let isMinimizing = false;
let mainWindow;
let startUp = false;
let brightness = 0;
let opacity = 0;
let rgb = 0;
let bluelight = 0;
let log;
let canvasVlaue=[];

function getCurrentUsername() {
  if (process.platform === 'win32') {
    return process.env.USERNAME;
  } else {
    return execSync('whoami').toString().trim();
  }
}

{
  const { powerMonitor } = require('electron');

  // Listen for screen off (suspend) events
  powerMonitor.on('suspend', () => {
    console.log('Screen display turned off');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('screen-off');
    }
  });

  // Listen for screen on (resume) events
  powerMonitor.on('resume', () => {
    console.log('Screen display turned on');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('screen-on');
    }
  });


  if (require('electron-squirrel-startup')) {
    if (process.argv.length === 1 || process.argv.find(arg => arg.match(/^--squirrel/))) {
      app.quit(); // Exit the application
    }
  }
  //uswer startup
  app.on('ready', checkAppActive);
}
function checkAppActive() {

  const userPath = app.getPath('userData');
  const isAnotherInstanceRunning = app.requestSingleInstanceLock();


  if (isAnotherInstanceRunning) {//when newest and only instance
    createWindow();
  } else {

    try {
      //app.on('second-instance', (event, commandLine, workingDirectory) => {
      mainWindow = new BrowserWindow({
        width: 1980,
        height: 1500,
        frame: false,
        webPreferences: {
          nodeIntegration: true,
        },
        show: false,
      });
      mainWindow.webContents.send('open-duplicate-window');
      console.log("duplicate ditectated and destroyed.");
      mainWindow.webContents.send('logger', log);

      //});
    }
    catch (error) {
      console.log(error.message);
    }
    //app.quit();

  }
}
const createWindow = () => {



  mainWindow = new BrowserWindow({
    width: 1980,
    height: 1500,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    //parent: seconWindow,
    icon: blueLightIcon,
    show: false,
  });
  // Show the main window only if not already running in the background
  if (!app.getLoginItemSettings().wasOpenedAtLogin) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  } else {
    sendNotification("BlueLight Filter", "Your app is was running in background.");
  }
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.openDevTools();

  mainWindow.webContents.once('dom-ready', () => {

    mainWindow.on('minimize', () => {
      isMinimizing = true;

      minimizeTimeout = setInterval(() => {
        isMinimizing = true;
      }, 1000);

    });

    mainWindow.on('restore', () => {


      isMinimizing = true;
      thirdWindow.setAlwaysOnTop(false);
      thirdWindow.hide();
      thirdWindow.setSkipTaskbar(true);
      if (startUp) {
        updateFilter(bluelight, 33, 'o')
      }
    });

    mainWindow.on('blur', (event) => {

      //console.log(startUp);
      if (!isMinimizing && startUp) {

        isMinimizing = true;
        mainWindow.webContents.send('query-background');
      }

    });

  });



  mainWindow.once('ready-to-show', () => {

  });

  // Quit the app only when all windows are closed
  app.on('window-all-closed', () => {
    // Do nothing here to prevent quitting the app
  });

  mainWindow.on('closed', (event) => {
    app.quit();
  });

  // Handle the before-quit event to prevent quitting the app when the main window is closed
  app.on('before-quit', (event) => {
    //event.preventDefault();
    //if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.hide(); }
  });

  appLauncher.isEnabled().then((isEnabled) => {
    if (!isEnabled) {
      appLauncher.enable();
      sendNotification("BlueLight Filter", "Launch app on startup Enabled.");
    }
    else {
      //appLauncher.disable();
      //sendNotification("BlueLight Filter", "Launch app on startup already enabled.");
      //console.log(appLauncher);
    }
  });


  currentUser = getCurrentUsername();
  store.set('isAppChangingBrightness', false);
  listenForBrightnessChange();
  createThirdWindow();
  startUp = false;
};
let xc = 1380;
let w = 145;
let h = 75;
function createThirdWindow() {
  thirdWindow = new BrowserWindow({
    width: 145,
    height: 75,
    x: 1380,
    y: 10,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'controlBar.js')
    }
  });

  //thirdWindow.webContents.openDevTools();
  const statsConfig = path.join(__dirname, 'Blue Light panel.html');
  thirdWindow.loadFile(statsConfig);
  //thirdWindow.setAlwaysOnTop(true);
  thirdWindow.on('closed', () => {
    thirdWindow = null;
  });
}
function listenForBrightnessChange() {//////////////
  let primaryDisplay = screen.getPrimaryDisplay();
  let lastBrightness = null;

  setInterval(() => {

    isAppChangingBrightness = store.get('isAppChangingBrightness') === true;
    // console.log(isAppChangingBrightness);
    try {
      let brightnessCommand = 'powershell (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness';
      exec(brightnessCommand, (error, stdout) => {
        if (error) {
          console.error('Error:', error);
          return;
        }
        else {
          brightness = parseFloat(stdout.trim());

          if (lastBrightness !== brightness) {

            if (isAppChangingBrightness === true) {
              //console.error(" APPLICATION");
              //console.log(brightness, lastBrightness);
            }
            else
            //if (logInSuccess)
            {
              calculateBlueLightPercentage();
              //console.warn(fileContent);
              console.log(brightness + '  ' + lastBrightness);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('brightness-change', brightness, !isAppChangingBrightness);
                lastBrightness = brightness;
                //setBrightness(brightness);
                //console.info(" SYSTEM");
              }

            }
          }
          lastBrightness = brightness;
        }
      });
    } catch (error) {
      //console.error('Error:', error);
      console.error('stderr:', stderr); // Log stderr for additional information
    }

  }, 1000);
}
function setBrightness(brightness) {
  const changeBrightness = require('node-brightness');
  const intervalDuration = 2000;

  store.set('isAppChangingBrightness', true);

  changeBrightness(brightness, function (err) {
    if (err) {
      // Handle error if needed
    } else {
      //console.log('Brightness changed successfully', brightness);
    }
    calculateBlueLightPercentage();
    // Use setTimeout instead of setInterval for a one-time delay
    setTimeout(() => {
      store.set('isAppChangingBrightness', false);
      startUp = true;
    }, intervalDuration);

  });
}
function sendNotification(title, body0) {
  try {


    const options = {
      title: title,
      body: body0,
      silent: false,
      icon: blueLightIcon,
      timeoutType: 'default',
      sound: path.join(__dirname, '../assets/sound.mp3'),
      urgency: 'critical'
    };

    const customNotification = new Notification(options);

    customNotification.addListener('click', () => {
      toggleMaximizeWindow();
    });

    customNotification.addListener('show', () => {
      console.log('Notification is shown');
    });

    customNotification.addListener('close', (event) => {

      console.log('Notification is Automatically Closed');
      event.preventDefault();
    });

    // Display the notification
    customNotification.show();
  } catch (error) {
    console.log(error.message);
  }
}
function sendNotification0(title, body) {
  // Create a new notification object
  let notification = new Notification({
    body: body,
    icon: blueLightIcon, // Assuming blueLightIcon is defined elsewhere
    silent: false,
    timeoutType: 'default'
  });

  notification.onclick = () => {
    console.log('Notification clicked');
    checkAppActive();
  };

  notification.show();
  console.log(notification);
}
function calculateBlueLightPercentage() {

  if (mainWindow && !mainWindow.isDestroyed()) {

    //console.log(ambientLight);
    // ipcRenderer.send('start-camera');
    if (rgb) {
      const filterPower = ((rgb.red ?? 0) / 255 * 100);

      bluelight = (2 * filterPower * opacity ?? 0) + 0.085 * brightness;
      //console.warn(bluelight);
      //console.error(`The percentage of blue light in the color is: ${bluelight}%`);
      //mainWindow.webContents.send('overall-bluelight', bluelight);
      //console.log(bluelight);
      if (blueActive && bluelight) {
        mainWindow.webContents.send('overall-bluelight2', bluelight);
        //##UPDATE OVERLAY UTILITIES
      }

    }
    else {
      //console.log(rgb);
    }
  }

}
function calculateAdjustedBrightness(baseBrightness, ambientLightPercentage) {
  // Assuming baseBrightness is the brightness without any adjustment
  // and ambientLightPercentage is the ambient light level as a percentage (0 to 100)

  // Define the anchor point at 50% ambient light
  const anchorAmbientLight = 50;
  const anchorBrightnessAdjustment = 0; // No adjustment at anchor point

  // Calculate the adjustment as a percentage relative to the anchor point
  const brightnessAdjustment = (ambientLightPercentage - anchorAmbientLight) / anchorAmbientLight * anchorBrightnessAdjustment;

  // Apply the adjustment to the base brightness
  const adjustedBrightness = baseBrightness + brightnessAdjustment;

  // Ensure the adjusted brightness is within a valid range (e.g., 0 to 100)
  return Math.max(0, Math.min(100, adjustedBrightness));
}
function toggleMaximizeWindow(mode) {
  if (mainWindow) {

    if (mode === 'o') {
      mainWindow.restore();
      console.log('restoring');
      mainWindow.setOpacity(0);
      isMinimizing = false;
    }
    //if (mainWindow.isMaximized())
    {
      mainWindow.restore();
      console.log('restoring from background process');
      mainWindow.setOpacity(1);
      mainWindow.maximize();
      mainWindow.focus();
      mainWindow.setIgnoreMouseEvents(false);
      thirdWindow.setAlwaysOnTop(false);
      mainWindow.setAlwaysOnTop(false);
      thirdWindow.hide();
      mainWindow.setSkipTaskbar(false);
      //mainWindow.webContents.openDevTools();
      console.log('focusing');


    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      isMinimizing = false;
      mainWindow.webContents.send('restore-window', 'w');

    }

  }
}
function closeWindow(blueActive, controlPanelData, windowMode) {

  if (mainWindow) {
    if (!blueActive || windowMode == 'w') {
        if (windowMode === 'x') {
          mainWindow.close();
          console.log('quitting', bluelight);
        
        }
      if (windowMode === '-' || windowMode == 'w') {
        mainWindow.minimize();
        console.log('minimizing');
      }

    }
    if (blueActive) {

      if (windowMode != 'w') {
        console.log('background')
        mainWindow.setOpacity(parseFloat(controlPanelData[1]/200));
        mainWindow.maximize();
        mainWindow.focus();
        mainWindow.setIgnoreMouseEvents(true);
        mainWindow.setAlwaysOnTop(true);
        mainWindow.setSkipTaskbar(true);
      }
      else {
        console.log('docking')
      }
      thirdWindow.setAlwaysOnTop(true);
      thirdWindow.show();
      thirdWindow.setSkipTaskbar(true);
      //thirdWindow.webContents.openDevTools();

      if (windowMode === 'x') {
        //mainWindow.hide();
        sendNotification('BlueLight Active', 'BlueLight Filter running in the background.');
      }
    }

  

  }
}
function updateFilter(bluelight, controlPanelData, windowMode) {

  if (mainWindow && !mainWindow.isDestroyed()) {

    thirdWindow.webContents.executeJavaScript(`

    updateFilterControls(${bluelight});
    drawSpeedometer('canvas0', ${controlPanelData});
    appendBlueSwitch('${windowMode}');
    
  `);
  }
}


//iPMains
{

  ipcMain.on('open-duplicate-window', (sender) => {

    if (sender !== mainWindow) {
      //console.log(mainWindow);
      console.error(sender);
      app.quit();

      /* if (!mainWindow) {
         console.log('new');
         createWindow();
       }
       else {
         console.log('old');
         mainWindow.webContents.send('focus-window');
       }
       */
    }
  });

  ipcMain.on('read-file', (event, { filePath, loggedIn }) => {
    try {
      const path0 = path.join(__dirname, 'credentials.txt');
      const path1 = path.join(__dirname, 'statsData.txt');
      const path2 = path.join(__dirname, 'settingsConfig.txt');
      logInSuccess = loggedIn;
      const file0 = fs.readFileSync(path.join(__dirname, 'credentials.txt'), 'utf8');
      const file1 = fs.readFileSync(path.join(__dirname, 'statsData.txt'), 'utf8');
      const file2 = fs.readFileSync(path.join(__dirname, 'settingsConfig.txt'), 'utf8');

      event.reply('resource-files', path0, path1, path2, file0, file1, file2);
    } catch (err) {
      console.error('Error:', err);
    }
  });
  ipcMain.on('write-to-file', (event, { filePath, dataLines, logInSuccess0, blueActive0 }) => {
    try {
      logInSuccess = logInSuccess0;
      blueActive = blueActive0;
      console. error('nf');
      fs.writeFileSync(filePath, dataLines, 'utf-8');

    } catch (err) {
      console.error('Error:', err);
    }
  });

  ipcMain.on('update-brightness', (event, brightnessValue, loggedIn, filterActive) => {

    logInSuccess = loggedIn;
    blueActive = filterActive;
    brightness = brightnessValue;

    //console.log(blueActive, logInSuccess);
    setBrightness(brightnessValue);

  });

  ipcMain.on('window-mode', (event, mode, bluelight, controlPanelData) => {

    console.log(mode);
    canvasVlaue=controlPanelData;
    store.set('canvasVlaue', canvasVlaue);

    if (mode === "o") {
      toggleMaximizeWindow(mode);
    }
    else if (mode === "x" || mode === "-" || mode === 'w') {

      closeWindow(bluelight, canvasVlaue, mode);
    }

    updateFilter(bluelight, canvasVlaue[3]??12, mode);


  });

  ipcMain.on('image-light', (event, ambiency, logInSuccess) => {

    //if (logInSuccess) 
    {
      const opts = {
        delay: 0,
        output: 'jpeg',
        callbackReturn: 'location',
      };
      try {
        webcam.capture('output', opts, (err, data) => {
          if (!err) {
            // Construct the image path
            const imagePath2 = path.join(__dirname, 'output.jpg');
            const imageDirectory = path.dirname(imagePath2);
            const imagePath1 = path.dirname(imageDirectory);
            const imagePath = path.join(imagePath1, 'output.jpg');

            //console.warn('Image captured:', imagePath);

            Jimp.read(imagePath)
              .then(image => {
                calculateColorIntensity(image, (colorIntensity) => {

                  if (ambientLight != parseInt(colorIntensity)) {


                    if (ambientLight < parseInt(colorIntensity)) {
                      //console.log("Lowering brightness by ", ambientLight - brightness)
                    }
                    else {
                      //console.log("Increasing brightness by ", brightness - ambientLight)
                    }

                    ambientLight = colorIntensity;
                    //console.log(brightness, parseInt(ambientLight));
                    brightness = parseInt(ambientLight);

                    setBrightness(brightness)
                    event.reply('image captured', brightness);
                  }
                  else {
                    console.warn("Ambient light not changed");
                  }

                });
              })
              .catch(error => {
                console.error('Error reading image:', error);
              });

            //calculateBlueLightPercentage();
          } else {
            console.warn('DISABLED cam error :', err.message);
          }
        });
      }
      catch (error) {
        console.error(error);
      }
    }
  });

  ipcMain.on('send-notification', (event, title, message) => {
    sendNotification(title, message);
  });

  ipcMain.on('calc-light', (event, opacityValue) => {

    calculateBlueLightPercentage();

  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  ipcMain.on('floating-bar-action', (event, barAction) => {
    if (mainWindow) {

      canvasVlaue =   store.get('canvasVlaue', []);

      if (barAction === 'canvas') {
        toggleMaximizeWindow();
      }
      if (barAction === 'triggerMinimize') {


        if (mainWindow && !mainWindow.isDestroyed()) {
          isMinimizing = false;
          mainWindow.webContents.send('restore-window', '-');

        }

      }
      else if (barAction === '0') {
        mainWindow.setOpacity(0);
        mainWindow.webContents.send('kill-filter');
    
      }
      else if (barAction === '1'){
        opacity = parseFloat(canvasVlaue[2]/200);
        console.log(canvasVlaue,opacity);
        mainWindow.setOpacity(opacity);
        mainWindow.webContents.send('kill-filter');
      }
    }
  });

  ipcMain.on('dimensions', (event, dimensions) => {
    //dimensions={type: 'resize', width: 197, height: 79}
    var newX = 0;
    newX = xc - (dimensions.width - w);

    //console.log(xc,newX);
    thirdWindow.setResizable(true);
    thirdWindow.setSize(dimensions.width, h);
    thirdWindow.setPosition(newX, 10);
    thirdWindow.setResizable(false);
    
  });
}


function calculateColorIntensity(image, callback) {
  const imageData = image.bitmap;
  let totalIntensity = 0;

  // Iterate through each pixel and calculate color intensity
  for (let i = 0; i < imageData.width; i++) {
    for (let j = 0; j < imageData.height; j++) {
      const pixelColor = image.getPixelColor(i, j);
      const red = (pixelColor >> 16) & 0xff;
      const green = (pixelColor >> 8) & 0xff;
      const blue = pixelColor & 0xff;

      // Calculate color intensity for the current pixel and add it to the total
      totalIntensity += calculateIntensity(red, green, blue);
    }
  }

  // Calculate the average color intensity for the entire image
  const averageIntensity = parseInt((totalIntensity / (imageData.width * imageData.height)) / 2);

  // You can use averageIntensity or further process it as needed
  callback(averageIntensity);
}
function calculateIntensity(red, green, blue) {
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}




