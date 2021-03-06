/**
	@name glow.forms
	@namespace
	@see <a href="../furtherinfo/forms/">Validating Forms</a>
	@see <a href="../furtherinfo/forms/defaultfeedback/">Using default form feedback</a>
	@see <a href="../furtherinfo/forms/example.shtml">Working example</a>
	@description Validating HTML Forms.
		To get started, you'll need to create a {@link glow.forms.Form Form instance}.
 */
(window.gloader || glow).module({
	name: "glow.forms",
	library: ["glow", "@VERSION@"],
	depends: [["glow", "@VERSION@", 'glow.dom', 'glow.events', 'glow.anim', 'glow.net']],
	builder: function(glow) {


glow.forms = {};

/**
	@name glow.forms.Form
	@constructor
	@description Create an object to add tests to.
	@see <a href="../furtherinfo/forms/">Validating Forms</a>
	@see <a href="../furtherinfo/forms/defaultfeedback/">Using default form feedback</a>
	@param {glow.dom.NodeList | Selector} formNode
	@param {Object} [opts]
	@param {Function} [opts.onValidate] Handles the 'validate' event when all tests are complete. Default is glow.forms.feedback.defaultFeedback.
	@example
	myForm = new glow.forms.Form(
		glow.dom.get("#htmlFormId"),
		{
			onValidate: function(results) {
				// ...
			}
		}
	);
 */
glow.forms.Form = function(formNode, opts) { /*debug*///console.log("glow.forms.Form#new("+formNode+", "+opts+")");
	/**
	@name glow.forms.Form#formNode
	@type glow.dom.NodeList
	@description NodeList containing the form element
	*/
	this.formNode = glow.dom.get(formNode);
	if (!this.formNode[0]) throw "Could not find form. Possibly run before DOM ready.";
	this._fields = [];
	this._result = null;
	this.opts = opts || {};
	glow.events.addListener(this, "validate", this.opts.onValidate || feedback.defaultFeedback);

	this._idleTimer = null;

	// add event listener to form
	var thisForm = this;
	glow.events.addListener(
		this.formNode,
		"submit",
		function(){
			thisForm.validate('submit');
			return false;
		}
	);
}

/**
	@name glow.forms.Form#validate
	@function
	@description Run validation tests.
		This is called automatically depending on the tests added to the form.
		However, you can trigger validation manually
	@param {String} [eventName='submit'] Run only tests tied to this eventname.
	@param {String} [fieldName] Run only tests attached to the form element with this name.
 */
glow.forms.Form.prototype.validate = function(eventName, fieldName) { /*debug*///console.log("glow.forms.Form#validate("+eventName+", "+fieldName+")");
	this.eventName = eventName || 'submit'; // default
	this._result = new glow.forms.ValidateResult(this.eventName);
	this._result.form = this;

	this._fieldCur = 0;
	this._testCur = -1;

	this._fieldName = fieldName;
	this._nextTest();
}

/**
	Advance the test cursor to get the next test in the queue and then run it.
	@function
	@name glow.forms.Form#_nextTest
	@calledBy glow.forms.Form#validate
	@calledBy glow.forms#_onTestResult
	@private
 */
glow.forms.Form.prototype._nextTest = function() { /*debug*///console.log("glow.forms.Form#_nextTest()");
	this._testCur++;
	if (this._testCur >= this._fields[this._fieldCur]._tests.length) { // run out of tests for the current field?
		if (!this._nextField()) return false;
	}

	var currentTest = this._fields[this._fieldCur]._tests[this._testCur]; // shortcut

	// get value from form element, normalize into an array
	var fieldValue;
	if (currentTest.opts.field) { // a conditional test
		fieldValue = this.formNode.val()[currentTest.opts.field] || "";
		currentTest.isConditional = true;
	}
	else {
		fieldValue = this.formNode.val()[this._fields[this._fieldCur].name] || "";
	}

	// values should always be an array
	if (!fieldValue.join) fieldValue = [fieldValue];

	var callback = function(o) { // closure
		return function() { o._onTestResult.apply(o, arguments) };
	}(this);

	// only run tests that are tied to the eventName being validated
	currentTest.opts.on = currentTest.opts.on || "submit";
	if (
		this._result.eventName
		&& (" "+currentTest.opts.on+" ").indexOf(" "+this._result.eventName+" ") != -1 // assume space delimited event names
	) {
		// skip tests that are not tied to the fieldName being validated
		if (this._fieldName && this._fieldName != currentTest.name) {
			this._nextTest();
			return;
		}

		// run the test, if it exists
		if (typeof glow.forms.tests[currentTest.type] != "function") {
			throw "Unimplemented test: no test exists of type '"+currentTest.type+"'.";
		}
		glow.forms.tests[currentTest.type](fieldValue, currentTest.opts, callback, this.formNode.val());
	}
	else {
		this._nextTest();
	}
}

/**
	Advance the field cursor to get the next field in the queue.
	@function
	@name glow.forms.Form#_nextField
	@calledBy glow.forms.Form#_nextTest
	@private
 */
glow.forms.Form.prototype._nextField = function() { /*debug*///console.log("glow.forms.Form#_nextField()");
	// start at the beginning of the next field
	this._fieldCur++;
	this._testCur = 0;

	if (this._fieldCur >= this._fields.length) { // run out of fields?
		this._fieldCur = 0;
		// ready to fire the validate event now
		glow.events.fire(this, "validate", this._result);
		if (this.eventName == "submit" && this._result && !this._result.defaultPrevented()) this.formNode[0].submit();
		return false;
	}

	return true;
}

/**
	@name glow.forms.Form#_onTestResult
	@function
	@calledBy glow.forms.tests.*
	@param {Number} result One of: glow.forms.PASS, glow.forms.FAIL
	@param {String} message
	@private
 */
glow.forms.Form.prototype._onTestResult = function(result, message) { /*debug*///console.log("glow.forms.Form#_onTestResult("+result+", "+message+")");
	// convert result from a boolean to glow.forms.FAIL / glow.forms.PASS
	if (typeof result == "boolean") result = (result)? glow.forms.PASS : glow.forms.FAIL;

	// a conditional test has failed?
	if (this._fields[this._fieldCur]._tests[this._testCur].isConditional && result === glow.forms.FAIL) {
		result = glow.forms.SKIP; // failure of a conditional test becomes a skip
	}

	this._result.fields.push(
		{
			name: this._fields[this._fieldCur].name,
			result: result,
			message: message
		}
	);

	if (result !== glow.forms.PASS) { // might be a fail or a skip
		if (result === glow.forms.FAIL) this._result.errorCount++;

		// skip over all further tests for this field
		this._testCur = this._fields[this._fieldCur]._tests.length;
	}

	this._nextTest();
}

/**
	@name glow.forms.Form#addTests
	@function
	@description Add one or more tests to a field.
	@param {String} fieldName The name of the field to add tests to.
	@param {Array} [spec]
	
		Test specifications identify the type of test to be run on a field to
		determine whether it contains desired data. See docs on the
		{@link glow.forms.tests types of tests}.
	
	@example
	//pattern for a test specification
	[
	  "testName", //name of the test to run
	  {
	    arg     : 5,                //an argument for the test, not all tests need this
	    on      : "submit change",  //when should this test be run?
	    message : "Incorrect value" //a custom error message to display
	  }
	]
	
	@example
	//setting a form up for validation
	var myForm = new glow.forms.Form(glow.dom.get("#myFormId"))
		.addTests(
			"username",
			["required"],
			["maxLen", {
				arg: 12,
				message: "Name must be les than 12 characters long."
			}]
		)
		.addTests(
			"email",
			["isEmail"]
		);
 */
glow.forms.Form.prototype.addTests = function(fieldName /*...*/) { /*debug*///console.log("glow.forms.Form#addTests("+fieldName+", ...)");
	var field = {name: fieldName, _tests:[]};

	var changeCallback = function(that) {
		return function() {
			that.validate.apply(that, ["change", fieldName])
		};
	}(this);

	var clickCallback = function(that) {
		return function() {
			that.validate.apply(that, ["click", fieldName])
		};
	}(this);

	var idleCallback = function(that) {
		return function() {
			that.validate.apply(that, ["idle", fieldName]);
		};
	}(this);

	// loop over test specifications
	for (var i = 1; i < arguments.length; i++) {
		var testType = arguments[i][0];
		var testOpts = (arguments[i].length > 1)? arguments[i][1] : {}; // default opts

		field._tests.push({name: fieldName, type: testType, opts: testOpts});

		// add event listeners to form fields for change events
		if (!changeCallback.added && (" "+testOpts.on+" ").indexOf(" change ") != -1) {
			var inputs = this.formNode.get("*").each(function (i) {
				if (this.name == fieldName) {
					glow.events.addListener(this, "change", changeCallback);
					changeCallback.added = true;
				}
			});
		}

		// add event listeners to form fields for click events
		if (!clickCallback.added && (" "+testOpts.on+" ").indexOf(" click ") != -1) {
			var inputs = this.formNode.get("*").each(function (i) {
				if (this.name == fieldName) {
					glow.events.addListener(this, "click", clickCallback);
					clickCallback.added = true;
				}
			});
		}

		if (!idleCallback.added && (" "+testOpts.on+" ").indexOf(" idle ") != -1) {
			var idleDelay = (typeof testOpts.delay != "undefined")? parseInt(testOpts.delay) : 1000; // default delay before idle handler is run

			var inputs = this.formNode.get("*").each(function (i) {
				if (this.name == fieldName) {
					// FIXME: adding idleTimeoutID to HTML element, is this the best way?
					glow.events.addListener(this, "keyup", function(t){ return function() {window.clearTimeout(this.idleTimeoutID); if (this.value) this.idleTimeoutID = window.setTimeout(idleCallback, t)} }(idleDelay));
					glow.events.addListener(this, "blur", function() {window.clearTimeout(this.idleTimeoutID)});

					idleCallback.added = true;
				}
			});
		}
	}

	this._fields.push(field);

	return this; // chained
}

/**
	@name glow.forms.ValidateResult
	@constructor
	@description This is created automatically by the running validation and passed to
	the onValidate handler once all eligible tests have finished running.
	@param {String} eventName
	@property {String} eventName The name on the event that was associated with this validation.
	@property {Number} errorCount The number of fields that had a failing test.
	@property {Object[]} fields Each field object has a name, a value {-1, 0, 1}, and a message.
 */
glow.forms.ValidateResult = function(eventName) {
	glow.events.Event.apply(this);

	this.eventName = eventName;
	this.errorCount = 0;
	this.value = undefined;
	this.fields = [];
}

glow.lang.extend(glow.forms.ValidateResult, glow.events.Event);

/**
	@name glow.forms.PASS
	@type Number
	@description Constant for a passed test.
		You can use this when creating {@link glow.forms.tests.custom custom tests}
 */
glow.forms.PASS =  1;
/**
	@name glow.forms.FAIL
	@type Number
	@description Constant for a failing test.
		You can use this when creating {@link glow.forms.tests.custom custom tests}
 */
glow.forms.FAIL =  0;
/**
	@name glow.forms.SKIP
	@type Number
	@description Constant for a skipped test.
		You can use this when creating {@link glow.forms.tests.custom custom tests}.
 */
glow.forms.SKIP = -1;

/**
	@name glow.forms.tests
	@namespace
	@see <a href="../furtherinfo/forms/">Validating Forms</a>
	@see <a href="../furtherinfo/forms/example.shtml">Working example</a>
	@description Collection of built-in tests that can be added to validate a form field.

	<p>You do not generally need to call these functions directly, their names are passed to the
	Form {@link glow.forms.Form#addTests addTests} method.</p>

	<p>If you want to create your own custom functions, or to see what the parameters these
	function take, you should refer to the <a href="../furtherinfo/forms/#custom_tests">Creating
	Custom Tests</a> section of the Validating Forms user guide.</p>
 */
glow.forms.tests = {
	/**
		@name glow.forms.tests.required
		@function
		@description The value must contain at least one non-whitespace character.
		@example
		myForm.addTests(
			"fieldName",
			["required"]
		);
	 */
	required: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.required()");
		var message = opts.message || "Value is required";

		for (var i = 0, len = values.length; i < len; i++) {
			if (/^\s*$/.test(values[i])) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.isNumber
		@function
		@description The value must be a valid number.
		@example
		myForm.addTests(
			"fieldName",
			["isNumber"]
		);
	 */
	isNumber: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.isNumber()");
		var message = opts.message || "Must be a number.";

		for (var i = 0, len = values.length; i < len; i++) {
			if (values[i] == "" || isNaN(values[i])) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.min
		@function
		@description The numeric value must be at least the given value.
		@example
		myForm.addTests(
			"fieldName",
			["min", {
				arg: "1"
			}]
		);
	 */
	min: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.min()");
		var message = opts.message || "The value must be at least "+opts.arg+".";
		for (var i = 0, len = values.length; i < len; i++) {
			if (Number(values[i]) < Number(opts.arg)) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.max
		@function
		@description The numeric value must be no more than the given value.
		@example
		myForm.addTests(
			"fieldName",
			["max", {
				arg: "100"
			}]
		);
	 */
	max: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.max()");
		var message = opts.message || "The value must be less than "+opts.arg+".";
		for (var i = 0, len = values.length; i < len; i++) {
			if (Number(values[i]) > Number(opts.arg)) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.range
		@function
		@description The numeric value must be between x..y.
		@example
		myForm.addTests(
			"fieldName",
			["range", {
				arg: "18..118"
			}]
		);
	 */
	range: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.range()");
		var minmax = opts.arg.split(".."); // like "0..10"
		if (typeof minmax[0] == "undefined" || typeof minmax[1] == "undefined") {
			throw "Range test requires a parameter like 0..10."
		}
		var message = opts.message || "The value must be "+minmax[0]+" or greater, and less than "+minmax[1]+".";

		// cast to numbers to avoid stringy comparisons
		minmax[0] *= 1;
		minmax[1] *= 1;

		// reverse if the order is hi..lo
		if (minmax[0] > minmax[1]) {
			var temp = minmax[0];
			minmax[0] = minmax[1];
			minmax[1] = temp;
		}

		for (var i = 0, len = values.length; i < len; i++) {
			if (values[i] < minmax[0] || values[i] > minmax[1]) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.minCount
		@function
		@description There must be at least the given number of values submitted with this name.
			This is useful for multiple selects and checkboxes that have the same name.
		@example
		myForm.addTests(
			"fieldName",
			["minCount", {
				arg: "1"
			}]
		);
	 */
	minCount: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.minCount()");
		var message = opts.message || "Must be have at least "+opts.arg+" values.";

		var count = 0;

		for (var i = 0; i < values.length; i++ ) {
			if (values[i] != "") count++;
		}

		if (count < opts.arg) {
			callback(glow.forms.FAIL, message);
			return;
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.maxCount
		@function
		@description There must be no more than the given number of values submitted with this name.
			This is useful for multiple selects and checkboxes that have the same name.
		@example
		myForm.addTests(
			"fieldName",
			["maxCount", {
				arg: "10"
			}]
		);
	 */
	maxCount: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.maxCount()");
		var message = opts.message || "Must be have at most "+opts.arg+" values.";

		var count = 0;

		for (var i = 0; i < values.length; i++ ) {
			if (values[i] != "") count++;
		}

		if (count > opts.arg) {
			callback(glow.forms.FAIL, message);
			return;
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.count
		@function
		@description There must be exactly the given number of values submitted with this name.
			This is useful for multiple selects and checkboxes that have the same name.
		@example
		myForm.addTests(
			"fieldName",
			["count", {
				arg: "2"
			}]
		);
	 */
	count: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.count()");
		var message = opts.message || "Must have "+opts.arg+" values.";

		var count = 0;

		for (var i = 0; i < values.length; i++ ) {
			if (values[i] != "") count++;
		}

		if (count != opts.arg) {
			callback(glow.forms.FAIL, message);
			return;
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.regex
		@function
		@description The value must match the given regular expression.
		@example
		myForm.addTests(
			"fieldName",
			["regex", {
				arg: /^[A-Z0-9]*$/
			}]
		);
	 */
	regex: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.regex()");
		var message = opts.message || "Must be in the correct format.";

		var regex = (typeof opts.arg == "string")? new RegExp(opts.arg) : opts.arg; // if its not a string assume its a regex literal
		for (var i = 0, len = values.length; i < len; i++) {
			if (!regex.test(values[i])) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.minLen
		@function
		@description The value must be at least the given number of characters long.
		@example
		myForm.addTests(
			"fieldName",
			["minLen", {
				arg: "3"
			}]
		);
	 */
	minLen: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.minLen()");
		var message = opts.message || "Must be at least "+opts.arg+" characters.";

		for (var i = 0, len = values.length; i < len; i++) {
			if (values[i].length < opts.arg) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.maxLen
		@function
		@description The value must be at most the given number of characters long.
		@example
		myForm.addTests(
			"fieldName",
			["maxLen", {
				arg: "24"
			}]
		);
	 */
	maxLen: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.maxLen()");
		var message = opts.message || "Must be at most "+opts.arg+" characters.";

		for (var i = 0, len = values.length; i < len; i++) {
			if (values[i].length > opts.arg) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.isEmail
		@function
		@description The value must be a valid email address.
			This checks the formatting of the address, not whether the address
			exists.
		@example
		myForm.addTests(
			"fieldName",
			["isEmail"]
		);
	 */
	isEmail: function(values, opts, callback) { /*debug*///console.log("glow.forms.tests.isEmail()");
		var message = opts.message || "Must be a valid email address.";

		for (var i = 0, len = values.length; i < len; i++) {
			if (!/^[A-Za-z0-9](([_\.\-]*[a-zA-Z0-9]+)*)@([A-Za-z0-9]+)(([\.\-]?[a-zA-Z0-9]+)*)\.([A-Za-z]{2,})$/.test(values[i])) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.sameAs
		@function
		@description The value must be the same as the value in the given field.
		@example
		myForm.addTests(
			"email_confirm",
			["sameAs", {
				arg: "email"
			}]
		);
	 */
	sameAs: function(values, opts, callback, formValues) { /*debug*///console.log("glow.forms.tests.sameAs()");
		var message = opts.message || "Must be the same as: "+opts.arg;
		var compareTo = formValues[opts.arg];

		for (var i = 0, len = values.length; i < len; i++) {
			if (values[i] != compareTo) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.ajax
		@function
		@description Send the data to the server for testing.
			A request to the given URL will be made and the response will be passed to the given callback.
			
			'arg' is the function to handle the response from the server.
			
			'url' is the url to call. You can use placeholders in here for form values (see example).
		@example
		function handleResponseText(response) {
			if (response.text() == "OK") {
				return glow.forms.PASS;
			} else {
				return glow.forms.FAIL;
			}
		}

		myForm.addTests(
			"username",
			["ajax", {
				arg: handleResponseText,
				url: "/cgi/checkname.cgi?name={username}"
			}]
		);
	 */
	ajax: function(values, opts, callback, formValues) { /*debug*///console.log("glow.forms.tests.ajax() - "+opts.url);
		var queryValues = {};
		for (var p in formValues) {
			if (typeof formValues[p] == "string") {
				queryValues[p] = escape(formValues[p]);
			}
			else if (typeof formValues[p].push != "undefined") {
				queryValues[p] = glow.lang.map(formValues[p], function(i) { return escape(i); }).join(",");
			}
		}
		var url = glow.lang.interpolate(opts.url, queryValues);

		var request = glow.net.get(url, {
			onLoad: function(response) { /*debug*///console.log("glow.forms.tests.ajax - onLoad()");
				callback(opts.arg(response), "server responded");
			},
			onError: function(response) {
				alert("Error getting file: "+url);
			}
		});
	}
	,
	/**
		@name glow.forms.tests.custom
		@function
		@description Create a custom test.
		
			'arg' is a function which tests the form value.
			
			The function is given the following parameters:
			
			<dl>
				<dt>values</dt>
				<dd>
					An array of values submitted for that form field. If you
					are only expecting one value, it can be accessed via values[0]
				</dd>
				<dt>opts</dt>
				<dd>
					An object of any additional data included with the test
				</dd>
				<dt>callback</dt>
				<dd>
					This is a function used to tell Glow whether the test has
					passed or not. A callback is used rather than 'return' to
					allow async tests. The first parameter is either glow.forms.PASS
					or glow.forms.FAIL, the second is the success or failure message.
				</dd>
				<dt>formData</dt>
				<dd>
					This is an object of all values captured in the form.
				</dd>
			</dl>
		
		@example
		myForm.addTests(
			"username",
			["custom", {
				arg: function(values, opts, callback, formData) {
					for (var i = 0, len = values.length; i < len; i++) {
						if (values[i] == "Jake") {
							callback(glow.forms.FAIL, "The name Jake is not allowed.");
							return;
						}
					}
					callback(glow.forms.PASS, "Good name.");
				}
			}]
		);
	 */
	custom: function(values, opts, callback) {  /*debug*///console.log("glow.forms.tests.custom()");
		opts.arg.apply(this, arguments);
	}
	,
	/**
		@name glow.forms.tests.is
		@function
		@description The value must be equal to a particular value
		@example
		// this test ensures "other" is required *if* the "reason" field is equal to "otherReason"
		myForm.addTests(
			"other",
			["is", {
				field: "reason",
				arg: "otherReason"
			}],
			["required"]
		);
	 */
	"is": function(values, opts, callback) {
		var message = opts.message || "Must be " + opts.arg;

		for (var i = 0, len = values.length; i < len; i++) {
			if (values[i] != opts.arg) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
	,
	/**
		@name glow.forms.tests.isNot
		@function
		@description The value must not be equal to a particular value
		@example
		// you may have a dropdown select where the first option is "none" for serverside reasons
		myForm.addTests(
			"gender",
			["isNot", {
				arg: "none"
			}]
		);
	 */
	"isNot": function(values, opts, callback) {
		var message = opts.message || "Must not be " + opts.arg;

		for (var i = 0, len = values.length; i < len; i++) {
			if (values[i] == opts.arg) {
				callback(glow.forms.FAIL, message);
				return;
			}
		}
		callback(glow.forms.PASS, message);
	}
}


/**
@name glow.forms.feedback
@namespace
@description Collection of functions for displaying validation results to the user

  <p>These functions should be used as handlers for {@link glow.forms.Form}'s validate event. At the
  moment there is only one provided handler, more may be added in the future.</p>

  <p>Of course, you don't have to use any of the methods here, you can provide your own.</p>

@see <a href="../furtherinfo/forms/defaultfeedback">Using the default form feedback</a>
*/

var feedback = glow.forms.feedback = {};

/**
@name glow.forms.feedback.defaultFeedback
@function
@description Default handler used by {@link glow.forms.Form}.

  <p>This method outputs messages to the user informing them which fields
  contain invalid data. The output is unstyled and flexible.</p>

@param {glow.forms.ValidateResult} result Object provided by the validate event

@see <a href="../furtherinfo/forms/defaultfeedback">Using the default form feedback</a>
*/
feedback.defaultFeedback = (function() {
	
	//a hidden form element used to update a screenreader's buffer
	var screenReaderBufferUpdater;
	
	//attempts to update the buffer of the screen reader
	function updateScreenReaderBuffer() {
		if (!screenReaderBufferUpdater) {
			screenReaderBufferUpdater = glow.dom.create('<input type="hidden" value="0" name="@VERSION@" id="@VERSION@" />').appendTo(document.body);
		}
		screenReaderBufferUpdater[0].value++;
	}
	
	//write out the messages which appear next to (or near) the fields
	function inlineErrors(response) {
		var fields = response.fields, //field test results
			fieldElm, //holder for the field element(s) being processed
			msgContainer, //holder for contextual message holder
			labelError, //error holder within label element
			i, len;

		for (i = 0, len = fields.length; i < len; i++) {
			fieldElm = glow.dom.get(response.form.formNode[0].elements[fields[i].name]);
			//here's where we get the error container, which is the label by default
			//also we need to escape invalid css chars CSS
			msgContainer = glow.dom.get("." + fields[i].name.replace(/(\W)/g, "\\$1") + "-msgContainer");
			if (!msgContainer[0] && fieldElm.length == 1) {
				//none found, try and get the label
				msgContainer = response.form.formNode.get("label").filter(function() { return this.htmlFor == fieldElm[0].id })
			}

			labelError = msgContainer.get("span.glow-errorMsg");

			if (fields[i].result) {
				//clear error messages & classes
				labelError.remove();
				fieldElm.removeClass("glow-invalid");
			} else {
				if (msgContainer.length) {
					//add the error span to the label if it isn't already there
					if (!labelError[0]) {
						msgContainer.append( (labelError = glow.dom.create('<span class="glow-errorMsg"></span>')) );
					}
					labelError.text(fields[i].message);
					fieldElm.addClass("glow-invalid");
				}
			}
		}
	}

	//write out a list of errors to appear at the top of the form
	function summaryError(response) {
		var fields = response.fields, //field test results
			fieldElm, //holder for the field element(s) being processed
			errorSummary, //div containing error summary
			errorList, //list of errors inside the error summary
			promptContainer, //holds the 'question' of the field
			prompt, //text to prefix each error line with
			i,
			len;

		//remove existing summary
		response.form.formNode.get("div.glow-errorSummary").remove();
		//create a summary div
		errorSummary = glow.dom.create('<div class="glow-errorSummary" tabindex="-1"><ul></ul></div>');
		errorList = errorSummary.get("ul");
		for (i = 0, len = fields.length; i < len; i++) {
			fieldElm = glow.dom.get(response.form.formNode[0].elements[fields[i].name]);
			promptContainer = glow.dom.get("." + fields[i].name.replace(/(\W)/g, "\\$1") + "-prompt");
			if (!promptContainer[0] && fieldElm.length == 1) {
				//we don't have a default, get the label
				promptContainer = response.form.formNode.get("label").filter(function() { return this.htmlFor == fieldElm[0].id })
			}
			//did we get a prompt container?
			if (promptContainer[0]) {
				//get rid of superflous content in the prompt container (such as errors)
				promptContainer.get("span.glow-errorMsg").remove();
				prompt = glow.lang.trim(promptContainer.text());
				if (prompt.slice(-1) == ":") {
					prompt = prompt.slice(0, -1);
				}
			} else {
				//else we just use the field name
				prompt = fields[i].name.replace(/^\w/, function(s) { return s.toUpperCase() } );
			}

			if (!fields[i].result) {
				errorList.append( glow.dom.create("<li></li>").text(prompt + ": " + fields[i].message) );
			}
		}
		response.form.formNode.prepend(errorSummary.css("opacity", "0"));
		glow.anim.css(errorSummary, "0.5", {
			opacity: {from: 0, to: 1}
		}, {tween: glow.tweens.easeOut()}).start();
		
		// if the error summary has been hidden, IE7 throws an exception here
		try {		
			errorSummary[0].focus();
		} catch (e) {}
		
		updateScreenReaderBuffer();
	}

	return function(response) {
		if (response.eventName == "submit") {
			//do we have any errors?
			if (!response.errorCount) {
				//remove existing summary
				response.form.formNode.get("div.glow-errorSummary").remove();
				return;
			}
			summaryError(response);
		}
		// display inline errors
		// we put this inside setTimeout to avoid an IE bug that can result
		// in the cursor appearing outside the form element
		setTimeout(function() {
			inlineErrors(response);
		}, 0);
		
		return false;
	}
}());

	}
});
