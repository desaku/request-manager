const util = require('util');
const request = require('request');
const EventEmitter = require('events').EventEmitter;

// Global Event Emitter (initialized)
var self; 

// Local Event Emitter
var localEvent = new EventEmitter();

// Manually defined kill variable. If 'true', stops all activity
// as soon as possible.
var kill = false;

// Local variables 
var managerState = {
    linkArray: [],
    numberConcurrent: 5,
    waitTime: 0,
    requestOptions: {
        uri: ''
    },
    linkArrayLength: 0
};

// Variables that track the current state of the requests
var localState = {
    numberStarted: 0,
    finishedRequests: 0
};


// Escalate any local errors to the instantiator
localEvent.on('error', (msg) => {
    setTimeout(() => {
        self.emit('error', msg);
    }, 0);
});


// Count the number of finished requests, and prepare the next
// batch
localEvent.on('request_done', () => {
    localState.numberStarted--;
    localState.finishedRequests++;

    // Once all the requests in the current batch have finished
    if (localState.numberStarted === 0) {

        // In all these conditions, if the 'kill' flag is set
        // to true then all execution stops.

        // If all the requests have been completed, emit an 'end' Event
        if ((localState.finishedRequests === managerState.linkArrayLength) && !kill) {
            self.emit('end');

        } else if ((managerState.waitTime === 0) && !kill) {
            // If no wait time is set, immediately start the next batch
            iterate(localState.finishedRequests, 
                localState.finishedRequests + managerState.numberConcurrent);

        } else if (!kill) {
            // Wait for 'waitTime' milliseconds, then start the next batch
            setTimeout(() => {
                iterate(localState.finishedRequests, 
                    localState.finishedRequests + managerState.numberConcurrent);
            }, managerState.waitTime);
        }
    }
});


// Constructor
function RequestManager(options) {
    self = this;
    kill = false;

    // Set the link array and its length
    if (options.linkArray !== null) {
        managerState.linkArray = options.linkArray;
        managerState.linkArrayLength = managerState.linkArray.length;
    }

    // Check and set the option variables
    if (options.numberConcurrent !== null) {
        managerState.numberConcurrent = options.numberConcurrent;
    }

    if (options.waitTime !== null) {
        managerState.waitTime = options.waitTime;
    }

    if (options.requestOptions !== null) {
        managerState.requestOptions = options.requestOptions;
    }

    // Reset local request state variables
    localState.numberStarted = 0;
    localState.finishedRequests = 0;
}


// Start the request manager
RequestManager.prototype.start = function () {
    // Reset the 'kill' flag
    kill = false;

    // Check that the variables are ready
    assertReady((ready, err_msg) => {
        if (ready) {
            iterate(0, managerState.numberConcurrent);
        } else {
            localEvent.emit('error', err_msg);
        }
    });
}


// Stop the request manager
RequestManager.prototype.stop = function () {
    // Enable the 'kill' flag, halting any operations that
    // check for it
    kill = true;
}


// Update the waitTime in milliseconds
RequestManager.prototype.updateWaitTime = function (newWaitTime) {
    if (newWaitTime >= 0) {
        managerState.waitTime = newWaitTime;
    } else {
        localEvent.emit('error', 'The waitTime must be larger than 0');
    }
}


//Request a batch of links from the linkArray
function iterate(startIndex, endIndex) {
    var i;

    // If the 'endIndex' reaches past the array's bounds
    if (endIndex > managerState.linkArrayLength) { 
        endIndex = managerState.linkArrayLength;
    }

    // Set the number of requests that have been started
    localState.numberStarted = endIndex - startIndex;

    // Request the next batch
    for (i = startIndex; i < endIndex; i++) {
        // If the requests are stopped, break immediately
        if (kill) { break; }

        // Request the link
        linkRequest(managerState.linkArray[i], i);
    }
}


// Checks that the manager is ready to safely start requests. 
// Callsback with True if all values are valid, and False otherwise.
function assertReady(cb) {
    
    // Checks the length of the linkArray, waitTime, and 
    // numberConcurrent. If invalid parameters are set for
    // the 'request' module, it will throw its own errors.
    if (managerState.linkArrayLength < 1) {
        cb(false, 'The link array must have at least one link');
    }

    if (managerState.waitTime < 0) {
        cb(false, 'The waitTime must be larger than 0');
    }

    if (managerState.numberConcurrent < 1) {
        cb(false, 'The number of concurrent request must greater than 0');
    }

    // If none of the error conditions are false, callback with 'true'
    cb(true, '');
}


// Request the link and emit when done. If there is an error in
// the 'request' module, don't handle it and pass it back to the 
// instantiator.
function linkRequest(currentLink, currentIndex) {
    // Set the current link to request
    managerState.requestOptions.uri = currentLink;

    request(managerState.requestOptions, (error, response, body) => {

        if (!kill) {
            self.emit('data', error, {
                resp: response,
                data: body,
                link: currentLink,
                index: currentIndex
            });

            localEvent.emit('request_done');
        }
    });
}


// RequestManager inherits EventEmitter so it can emit
// events
util.inherits(RequestManager, EventEmitter);

// Export the RequestManager function
module.exports = RequestManager;
