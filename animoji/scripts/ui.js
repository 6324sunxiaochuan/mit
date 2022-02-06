var factory = require("./factory");
var templates = require("./templates");
var helper = require("./helper");

var puppetNames = helper.loadJSON("assets/puppets.json");
var movieExists = false;
var isExporting = false;
var refreshTimer = null;

var exportURL = (() => {
  var url = $objc("NSFileManager").$defaultManager().$URLsForDirectory_inDomains(9, 1).$lastObject();
  return url.$URLByAppendingPathComponent("animoji.mov");
})();

var puppetHeight = 320;
var puppetView = (() => {
  require("./puppet-view");
  var view = $objc("PuppetView").$new();
  view.$setFrame({ x: 0, y: 0, width: $device.info.screen.width, height: puppetHeight });
  return view;
})()

function render() {

  var selectedIndex = 0;
  var buttonSize = $size(36, 36);

  $ui.render({
    props: {
      title: $l10n("MAIN_TITLE")
    },
    views: [
      {
        type: "label",
        props: {
          id: "duration-label",
          text: "00:00",
          font: $objc("UIFont").$monospacedDigitSystemFontOfSize_weight(24, 0.3).rawValue(),
          align: $align.center
        },
        layout: (make, view) => {
          make.centerX.equalTo(view.super);
          make.top.equalTo(0);
        }
      },
      {
        type: "view",
        props: {
          id: "puppet-view"
        },
        layout: (make, view) => {
          make.top.equalTo($("duration-label").bottom);
          make.left.right.equalTo(0);
          make.height.equalTo(puppetHeight);
        }
      },
      {
        type: "view",
        props: {
          id: "separator",
          bgcolor: $color("separator")
        },
        layout: (make, view) => {
          make.left.right.equalTo(0);
          make.height.equalTo(2);
          make.bottom.equalTo($("puppet-view")).offset(52);
        }
      },
      {
        type: "button",
        props: factory.newButton("share-button", "022"), // share
        layout: (make, view) => {
          make.size.equalTo(buttonSize);
          make.right.inset(8);
          make.bottom.equalTo(_separatorView().top).offset(-8);
        },
        events: {
          tapped: () => {
            $device.taptic();
            exportMovie(url => $share.sheet([url.$absoluteString().rawValue()]));
          }
        }
      },
      {
        type: "button",
        props: factory.newButton("play-button", "049"), // play
        layout: (make, view) => {
          make.size.equalTo(buttonSize);
          make.right.inset(52);
          make.bottom.equalTo(_separatorView().top).offset(-8);
        },
        events: {
          tapped: () => {
            $device.taptic();
            if (_isPreviewing()) {
              stopPreview();
            } else {
              startPreview();
            }
          }
        }
      },
      {
        type: "button",
        props: factory.newButton("delete-button", "027"), // delete
        layout: (make, view) => {
          make.size.equalTo(buttonSize);
          make.right.inset(96);
          make.bottom.equalTo(_separatorView().top).offset(-8);
        },
        events: {
          tapped: () => {
            $device.taptic();
            removeRecording();
          }
        }
      },
      {
        type: "button",
        props: factory.newButton("record-button", "035"), // record
        layout: (make, view) => {
          make.size.equalTo(buttonSize);
          make.right.inset(140);
          make.bottom.equalTo(_separatorView().top).offset(-8);
        },
        events: {
          tapped: () => {
            $device.taptic();
            toggleRecording();
          }
        }
      },
      {
        type: "matrix", // puppet thumbnails
        props: {
          columns: 4,
          square: true,
          spacing: 8,
          template: templates.matrix,
          data: puppetNames.map(item => {
            return { "thumb-image": { image: factory.newPuppet(item) } }
          })
        },
        layout: (make, view) => {
          make.top.equalTo(_separatorView().bottom);
          make.left.bottom.right.equalTo(0);
        },
        events: {
          forEachItem: (view, indexPath) => {
            view.get("selected-border").hidden = indexPath.item != selectedIndex;
          },
          didSelect: (sender, indexPath) => {
            $device.taptic();
            selectedIndex = indexPath.item;
            sender.reload();
            selectPuppetAtIndex(indexPath.item);
          }
        }
      }
    ]
  });

  // Add puppet view, this can be improved once v1.25.0 released
  $("puppet-view").runtimeValue().$addSubview(puppetView);

  // Default button state
  setButtonEnabled("record-button", true);
  setButtonEnabled("delete-button", false);
  setButtonEnabled("play-button", false);
  setButtonEnabled("share-button", false);

  // Observe
  registerNotifications();

  // Default
  selectPuppetAtIndex(0);
}

function registerNotifications() {

  var events = {

    puppetDidStartRecording: sender => {
      
      removeExistingMovie();
      $("duration-label").text = "00:00";
      setMatrixViewEnabled(false);

      refreshTimer = $timer.schedule({
        interval: 1,
        handler: () => {
          var duration = puppetView.$recordingDuration();
          $("duration-label").text = helper.formatTime(duration);
        }
      });
    },

    puppetDidStopRecording: sender => {

      if (isExporting) {
        return;
      }

      if (refreshTimer) {
        refreshTimer.invalidate();
        refreshTimer = null;
      }

      setButtonEnabled("record-button", false);
      setButtonEnabled("delete-button", true);
      setButtonEnabled("play-button", true);
      setButtonEnabled("share-button", true);
      setMatrixViewEnabled(true);

      startPreview();
    },
    
    puppetDidFinishPlaying: sender => {
      if (!_isRecording()) {
        stopPreview();
      }
    }
  };

  $app.listen(events);
}

function selectPuppetAtIndex(index) {
  var name = puppetNames[index];
  var puppet = $objc("AVTPuppet").$puppetNamed_options(name, null);
  puppetView.$setAvatarInstance(puppet);
}

function removeRecording() {

  removeExistingMovie();

  puppetView.$stopRecording();
  puppetView.$stopPreviewing();

  setButtonEnabled("record-button", true);
  setButtonEnabled("delete-button", false);
  setButtonEnabled("play-button", false);
  setButtonEnabled("share-button", false);

  setButtonIsActive("record-button", false);
  setButtonIsActive("play-button", false);
}

function toggleRecording() {
  if (_isRecording()) {
    puppetView.$stopRecording();
    setButtonIsActive("record-button", false);
  } else {
    puppetView.$startRecording();
    setButtonIsActive("record-button", true);
  }
}

function startPreview() {
  puppetView.$stopPreviewing();
  puppetView.$startPreviewing();
  setButtonIsActive("play-button", true);
}

function stopPreview() {
  puppetView.$stopPreviewing();
  setButtonIsActive("play-button", false);
}

function exportMovie(completion) {

  if (movieExists) {
    completion(exportURL);
    return;
  }

  var options = NSDictionary.$new();
  var handler = $block("void, NSError *", error => {
    movieExists = true;
    isExporting = false;
    setButtonEnabled("delete-button", true);
    setButtonEnabled("share-button", true);
    completion(exportURL);
  });

  isExporting = true;
  setButtonEnabled("delete-button", false);
  setButtonEnabled("share-button", false);

  puppetView.$exportMovieToURL_options_completionHandler(exportURL, options, handler);
}

function removeExistingMovie() {
  movieExists = false;
  helper.deleteFile(exportURL);
}

function setButtonEnabled(id, enabled) {
  var button = $(id);
  button.enabled = enabled;
  button.alpha = enabled ? 1.0 : 0.3;
}

function setButtonIsActive(id, isActive) {
  $(id).bgcolor = isActive ? $color("red") : $color("tint");
}

function setMatrixViewEnabled(enabled) {

  var matrix = $("matrix");
  matrix.userInteractionEnabled = enabled;

  $ui.animate({
    duration: 0.4,
    animation: () => {
      matrix.alpha = enabled ? 1.0 : 0.3;
    }
  });
}

function _separatorView() {
  return $("separator");
}

function _isPreviewing() {
  return puppetView.$isPreviewing();
}

function _isRecording() {
  return puppetView.$isRecording();
}

module.exports = {
  render: render
}