$(document).on('show.bs.modal','#myModal', renderModal);

$(document).on('shown.bs.modal','#myModal', function(){$('.modal-footer').height($('.modal-header').height());});

$(document).on('hidden.bs.modal','#myModal', function() {  /// when modal closes, update recent selections
	getUpdatedLast(true);
	if ($('#countdown-button').length) {giveCountdownOption();};
	console.log(last);
	$('#relative-finish-times').empty();
});

$(function () {
	$('#datetimepicker').hide();
 	$('#datetimepicker').datetimepicker({
 		widgetPositioning: {
 			vertical: 'top',
			horizontal: 'right'
		}
	});
 });

function getEarliestMealTime() {
	var dict = [];
	relative_finish_times.each(function() {
		var id = $(this).attr('name'),
			val = $(this).val(),
			duration = durations[id],
			difference = duration - val;
		dict.push(difference);
	});
	return Math.max.apply(Math, dict);
};

function setDateTimeMin() {
	var	earliest_meal_time = moment().add(parseFloat($('#EPMT').text())+1,'minutes');   /// could be later than actual earliest meal time by up to 59 seconds
	console.log('date picker earliest meal time is being set to', earliest_meal_time.format('h:mm:ss A'));
	$('#datetimepicker').data("DateTimePicker").minDate(earliest_meal_time);
};

function setDateTimeBuffer() {  /// sets datetime picker date value to 10-10:59 minutes from earliest possible meal time
	console.log('datetime = empty string in set buffer:', $('#picker-input').val()==='');
	var	earliest_meal_time_plus_buffer = moment().add(parseFloat($('#EPMT').text())+11,'minutes');
	$('#datetimepicker').data("DateTimePicker").date(earliest_meal_time_plus_buffer);
};

function getRequiredStartTime() {
	var datetime = $('#picker-input').val(),
		meal_time = moment(new Date(datetime)),
		required_start_time = meal_time.subtract(parseFloat($('#EPMT').text()),'minutes');
	return required_start_time
};

function compareToNow(time) {
	var now = moment();
	if (time<now || !time.isValid()) {return false};
	return true
};

function createModalAlert(type,message) {
	$('.modal-alert').remove(); /// if there is an alert lying around, make room for new one
	var content = '<div class="alert alert-' + type + ' alert-dismissible modal-alert" role="alert"> <button type="button" class="close" data-dismiss="alert" aria-label="Close"> <span aria-hidden="true">&times;</span></button> ' + message + '</div>';
	$('.modal-footer').append(content);
	//$('#dump').append(content);
};

function setStartCookTime() {
	var required_start_time = getRequiredStartTime(),
		content = required_start_time.format('ddd MMM D YYYY [at] h:mm A'),
		element = $('#startCooking'),
		old_content = element.html(),
		target = $(event.target);
	if (target.hasClass('relativeFinishTime')) {
		if (!compareToNow(required_start_time)) {
			createModalAlert('danger','The selected meal time is no longer possible.  Please select again.');
		};
		if (old_content !== content) {element.html(content); return '#startCooking'} else {return ''};
	};
	element.html(content);  /// the content ignores seconds, so could be up to 59 seconds before actual required start time
	if (target.is('.glyphicon-chevron-up,.glyphicon-chevron-down,.minute,.hour,.day,.btn-primary,#picker-input')) {
		setIntervalX(function() {element.toggleClass('high')},500,1,'#startCooking');
	};
};

function setNoticeLimits() {
	var required_start_time = getRequiredStartTime(),
		now_plus_travel_time = moment().add(8,'seconds'),  /// it seems to take 8 seconds for text to arrive after celery countdown is finished
		available_notice = required_start_time.diff(now_plus_travel_time,'minutes'),
		notice = $('#minutes_notice'),
		notice_value = parseInt(notice.val());
	console.log(available_notice);
	console.log(required_start_time.diff(moment(),'seconds'));
	if (available_notice < 1) {
		notice.attr('max',0);
		if (!compareToNow(required_start_time)) {
			createModalAlert('danger','The selected meal time is no longer possible.  Please select again.');
		};
	} else {
		notice.attr('max',available_notice);
	};
	var max = parseInt(notice.attr('max')),
		min = 0;
	if (notice_value > max) {
		notice.val(max);
	} else if (notice_value < min) {
		notice.val(min);
	};
};

function getCookTime() {
	var rfts = {},
		max_rft = 0;
	relative_finish_times.each(function() {
		var val = parseInt($(this).val());
	    rfts[$(this).attr('name')] = val;
	    if (val>max_rft) {max_rft=val};
	});
	var	heights = [];
	for (var id in rfts) {
		var distance_to_finish_line = max_rft - rfts[id],
			height = durations[id] + distance_to_finish_line;
		heights.push(height);
	};
	return Math.max.apply(Math, heights);
};

var setIntervalXRunning = false,
	last_changed = '';

function setIntervalX(callback, delay, repetitions, changed) {
    if (!setIntervalXRunning || changed!==last_changed) {
    	callback();
    	window.setIntervalXRunning = true;
    	window.last_changed = changed;
    	var	x = 0,
    		intervalID = window.setInterval(function () {
    			callback();
		        if (++x === repetitions) {
		        	window.clearInterval(intervalID);
		            window.setIntervalXRunning = false;
		        };
		    }, delay);
    };
};

function setCookTime() {
	var cook_time = getCookTime(),
		element = $('#cookTime'),
		old_cook_time = parseFloat(element.html());
	console.log('old cook time = ',old_cook_time,'cook time = ',cook_time);
	if (old_cook_time !== cook_time) {element.html(cook_time); return '#cookTime'} else {return ''};
};

function setEarliestMealTime() {
	var earliest_meal_time = getEarliestMealTime(),
		element = $('#EPMT'),
		old_earliest_meal_time = parseFloat(element.html());
	if (old_earliest_meal_time !== earliest_meal_time) {element.html(earliest_meal_time); return '#EPMT'} else {return ''};
};

function countZeros() {
	var zero_count = 0;
	relative_finish_times.each(function() {
		if ($(this).val() === "0") {
			zero_count++;};
	});
	return zero_count;
};

function limitZeros(zero_count) {
	var zero_count = countZeros();
	if (zero_count === 1) {
		relative_finish_times.filter(function(){return $(this).val() === "0"}).attr("max","0");
	} else {
		relative_finish_times.filter(function(){return $(this).attr("max") === "0"}).attr("max","");
	};
};

$(document).on('click', '.relativeFinishTime', function() {
	var changed = [];
	limitZeros();
	changed.push(setCookTime());
	changed.push(setEarliestMealTime());
	if ($('#general_meal_time').val() === 'Delay') {changed.push(setStartCookTime());};
	changed = $.grep(changed,Boolean).join(",");
	console.log('changed = ', changed);
	setIntervalX(function() {$(changed).toggleClass('high')},500,1,changed);
});

function createGMTConsequences(event,modal_open) {
	if ($(event.target).val() === 'Delay') {
		var valid_meal_time = compareToNow(getRequiredStartTime());
		if (!valid_meal_time && !modal_open) {  /// mtnv nom.  other scenarios: mtv,om; mtv nom; mtnv om = set value to asap / don't create delay consequences
			setDateTimeBuffer();
		};
		if (valid_meal_time || !modal_open) {
			$('#start-cooking-now').hide();
			$('#datetimepicker,#reminder-header').show('slow');
			$('#reminder-toggle').prop('checked',false).change();
			return
		};
		$(event.target).val('ASAP');
	};
	$('#reminder-toggle').prop('checked',false).change();
	$('#datetimepicker,#reminder-header,#schedule-reminder').hide();
	$('#start-cooking-now').show('slow');
};

$(document).on('change','#general_meal_time', createGMTConsequences);

$(document).on('dp.change', '#datetimepicker', setStartCookTime);

$(document).on('dp.show', '#datetimepicker', setDateTimeMin);

$(document).on('click change', '#minutes_notice', setNoticeLimits);

$(document).on('change','#reminder-toggle',function() {
	if ($(this).is(':checked')) {
		if (!compareToNow(getRequiredStartTime())) {
			createModalAlert('danger','The selected meal time is no longer possible.  Please select again.');
			$(this).prop('checked',false);
		} else {
			$('#rem_ad_1').text(' ...');
			$('.reminder,#schedule-reminder').show('slow');
			if (user_phone) {
				var split_data = user_phone.split(',');
				$('#phone_number').val(split_data[0]);
				$('#phone_carrier').val(split_data[1]);
				$('#remember_phone').prop('checked',true);
				$('#reminder_method').val('Text').change();
			};
		};
	} else { /// if remind me to start cooking is un-checked ...
		var reminder_sections = $('.reminder,.phone_info'),
			reminder_inputs = reminder_sections.find('input,select');
		reminder_sections.hide('slow');
		reminder_inputs.val('');
		reminder_inputs.removeClass('needed_reminder_info');
		$('#schedule-reminder').hide('slow');
		$('#rem_ad_1').text('.');
		$('.modal-alert').remove();
	};
});

$(document).on('change', '#reminder_method,#minutes_notice,#phone_number,#phone_carrier', function() {
	if ($(this).attr('id') === 'reminder_method') {
		if ($(this).val() === 'Text') {
			$('#rem_ad_2').text(' ...');
			$('.phone_info').show('slow');
		} else {
			$('.phone_info').hide('slow');
			$('#rem_ad_2').text('.');
		};
	};
	if ($(this).hasClass('needed_reminder_info') && $(this).val() !== "" && $(this).val() !== null) {
		$(this).removeClass('needed_reminder_info');
	};
});

function getLastAndLeave(event) {
	event.preventDefault();
	var this_id = $(event.target).attr('id'),
		action = (this_id === 'create' || this_id === 'edit') ? "/create/edit" : "/" + this_id,
		last_string = (last) ? getUpdatedLast(true)[0] : "null",
		base_content = '<form method="post" action=' + action + '> <input type="hidden" name="last" value=' + last_string + '> ',
		content = (this_id === 'edit') ? base_content + '<input type="hidden" name="recipe_id" value=' + recipes.filter(':checked').val() + '> </form>' : base_content + '</form>';
	$(content).appendTo('body').submit();
};

$(document).on('click','#create,#edit,#help,#gdisconnect,#hub',getLastAndLeave);

function getUpdatedLast(remembering) {
	if (remembering) {
		var relative_finish_times = $('.relativeFinishTime'),
			rfts = {},
			recipe_ids = (typeof durations === "object") ? Object.keys(durations) : null;
		$('.scaleFactor').each(function() {
			last[$(this).attr('name')]['scale_factor'] = $(this).val();
		});
		if (relative_finish_times.length) {
			relative_finish_times.each(function() {
				var recipe_id = $(this).attr('name'),
					rft = $(this).val();
				last[recipe_id]['relative_finish_time'] = rft;
				rfts[recipe_id] = rft;
			});
			last['meal_time'] = ($('#general_meal_time').val() === 'Delay') ? new Date($('#picker-input').val()) : 'asap';
		};
		return [JSON.stringify(last),recipe_ids,rfts]
	} else {
		last = {'meal_time':'asap'};
		var recipe_ids = [];
		recipes.filter(':checked').each(function() {
			var recipe_id = $(this).val();
			last[recipe_id]={'relative_finish_time':0,'scale_factor':1};
			recipe_ids.push(recipe_id);
		});
		return [JSON.stringify(last),recipe_ids]
	};
};

$(document).on('click','#start-cooking-now', function() {  /// before rendering cook page template, update recent selections.
	var last = getUpdatedLast(true),
		string = JSON.stringify({cook_time:$('#cookTime').html(), durations:durations, relative_finish_times:last[2], recipe_ids:last[1], last:last[0]}),
      	content = '<form method="post" action="/cook"> ' + '<input type="hidden" name="start_cooking_now" value=' + string + '> </form>';
  $(content).appendTo('body').submit();
});

$(document).on('click','#schedule-reminder', function() {
	var empty_fields = false,
		invalid_phone_number = false,
		reminder_info = {};
	$('#reminder_method,#minutes_notice,#phone_number:visible,#phone_carrier:visible').each(function() {
		var value = $(this).val();
		if (value === "" || value === null) {  /// check for empty fields
			$(this).addClass('needed_reminder_info');  /// highlight fields that need attention
			empty_fields = true;
		} else {
			var this_id = $(this).attr('id');
			if (this_id==='phone_number') {   /// check for valid north american phone number
				var phone_number_match = value.match(/^\(?([2-9][0-8][0-9])\)?[-.\s]?([2-9][0-9]{2})[-.\s]?([0-9]{4})$/);
				if (!phone_number_match) {
					$(this).addClass('needed_reminder_info');
					invalid_phone_number = true;
				} else {
					value = phone_number_match.slice(1).join('');
				};
			};
			if (!empty_fields && !invalid_phone_number) {reminder_info[this_id]=value};
		};
	});
	console.log(reminder_info);
	if (empty_fields || invalid_phone_number) {  /// if empty fields and/or invalid phone number found, flash
			if (empty_fields) {
				if (invalid_phone_number) {
					var message = 'Please fill out empty fields, and enter your ten-digit phone number.';
				} else {
					var message = 'Please fill out empty fields.';
				};
			} else {
				var message = 'Please enter your ten-digit phone number.';
			};
			createModalAlert('danger',message);
	} else {  /// if all required fields have been filled out, and a valid phone number was provided, proceed.
		var datetime = $('#picker-input').val(),
			dt_moment = moment(new Date(datetime)),
			meal_time = dt_moment.clone(),
			required_start_time = dt_moment.subtract(parseFloat($('#EPMT').text()),'minutes'),
			now = moment();
		console.log(required_start_time.toDate());
		if (required_start_time<now) {  /// check if meal time is not possible
			createModalAlert('danger','The selected meal time is no longer possible.  Please select again.');
		} else {  /// if meal time possible, check if reminder is possible
			var	required_reminder_time = required_start_time.subtract(reminder_info.minutes_notice,'minutes');
			console.log(required_reminder_time.toDate());
			required_reminder_time = required_reminder_time.subtract(8,'seconds');  /// it seems to take 8 seconds for message to arrive after celery countdown
			if (required_reminder_time<now) {  /// check if reminder is not possible
				createModalAlert('danger','The selected notice amount is no longer possible.  Please select again.');
			} else {  /// if reminder is possible, post to server
				var	seconds_till_reminder = required_reminder_time.diff(now,'seconds'),
					rtfs = {},
					meal_time = meal_time.format('ddd MMM D YYYY [at] h:mm A'),
					success = function(data) {createModalAlert('success',data)};
				relative_finish_times.each(function() {
				    rtfs[$(this).prev().text()] = $(this).val();
				});
				console.log(reminder_method);
				console.log(seconds_till_reminder);
				console.log(now.toDate());
				if (reminder_info.reminder_method === "Email") {
					$.ajax({
					  	type: 'POST',
					  	contentType: 'application/json',
					  	url: '/schedule',
					  	data: JSON.stringify({
					    	seconds_till_reminder:seconds_till_reminder,
					    	relative_finish_times:rtfs,
					    	meal_time:meal_time,
					    	minutes_notice:reminder_info.minutes_notice
					    }),
					  	dataType:'text',
					  	success:success
					});
				} else {
					$.ajax({
						type:'POST',
						contentType:'application/json',
						url: '/schedule',
						data: JSON.stringify({
							seconds_till_reminder:seconds_till_reminder,
							relative_finish_times:rtfs,
							meal_time:meal_time,
							minutes_notice:reminder_info.minutes_notice,
							phone_number:reminder_info.phone_number,
							phone_carrier:reminder_info.phone_carrier,
							remember_phone:$('#remember_phone').prop('checked')
						}),
						dataType:'text',
						success:success
					});
				};
			};
		};
	};
});

