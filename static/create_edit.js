var ingredients = $('#ingredients'),
    directions = $('#directions');

var ingredient_div = '<div class="row form-row"> '
+ '<div class="col-md-3 col-md-offset-1"> ' + '<input class="form-control ingredient" type="text" placeholder="Name *"> </div> ' 
+ '<div class="col-md-2"> ' + '<input class="form-control ingredient" type="number" step="0.01" min = "0" placeholder="Number"> </div> ' 
+ '<div class="col-md-3"> ' + '<input class="form-control ingredient" type="text" placeholder="Units"> </div> '
+ '<div class="col-md-1"> ' + '<input class="btn btn-default" id="add_ingredient" type="button" value ="+"> </div> '
+ '<div class="col-md-1"> ' + '<input class="btn btn-default" id="remove_ingredient" type="button" value ="-"> </div> </div>';

var direction_div = '<div class="row form-row"> '
+ '<div class="col-md-6 col-md-offset-1"> ' +  '<textarea class="form-control direction" rows=1 placeholder="Description *"></textarea> </div> '
+ '<div class="col-md-2"> ' + '<input class="form-control direction" type="number" step="0.01" min="0" placeholder="Duration (min)"> </div> '
+ '<div class="col-md-1"> ' + '<input class="btn btn-default" id="add_direction" type="button" value ="+"> </div> ' 
+ '<div class="col-md-1"> ' + '<input class="btn btn-default" id="remove_direction" type="button" value ="-"> </div> </div>';


function Remove(event) {
    var count = event.data.fieldset.find('.row').length,
        string = event.data.string;
    $(this).parents('.row').first().remove();
    if (count === 2) {$("#remove_" + string).parent().remove();};
};

function Add(event) {
    var count = event.data.fieldset.find('.row').length,
        string = event.data.string,
        content = event.data.content;
    if (count === 1) {$(this).parents('.row').first().append('<div class="col-md-1"> <input class="btn btn-default" id="remove_' + string + '" type="button" value ="-"> </div>');};
    $(this).parents('.row').first().after(content);
};

$(document).on("click", "#remove_ingredient", {string:'ingredient', fieldset:ingredients}, Remove);

$(document).on("click", "#add_ingredient",{string:'ingredient', fieldset:ingredients, content:ingredient_div}, Add);

$(document).on("click", "#remove_direction", {string:'direction', fieldset:directions}, Remove);

$(document).on("click", "#add_direction",{string:'direction', fieldset:directions, content:direction_div}, Add);