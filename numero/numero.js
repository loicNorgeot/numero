"use strict"

// register the application module
b4w.register("numero_main", function(exports, require) {

// import modules used by the app
var m_app       = require("app");
var m_cfg       = require("config");
var m_data      = require("data");
var m_preloader = require("preloader");
var m_ver       = require("version");

var m_geo       = require("geometry");
var m_scenes    = require("scenes");
var m_objects   = require("objects");
var m_transform = require("transform");

var m_cont = require("container");
var m_input = require("input");
var m_mouse = require("mouse");
var m_trans = require("transform");
var m_cam   = require("camera");
var m_math  = require("math");
var m_vec3  = require("vec3");
var m_quat  = require("quat");

var SELECTION = [];
var _drag_mode = false;
var _rotate_mode = false;
var _obj_delta_xy = new Float32Array(2);
var _pline_tmp = m_math.create_pline();//new Float32Array(3);
var _vec3_tmp  = new Float32Array(3);
var _vec3_tmp2 = new Float32Array(3);
var _vec3_tmp3 = new Float32Array(3);
var _rotation_origin_vector = new Float32Array(3);
var FLOOR_PLANE_NORMAL = [0,0,1];
var _obj = null;


// detect application mode
var DEBUG = (m_ver.type() == "DEBUG");

// automatically detect assets path
var APP_ASSETS_PATH = m_cfg.get_assets_path("numero");

/**
 * export the method to initialize the app (called at the bottom of this file)
 */
exports.init = function() {
    m_app.init({
        canvas_container_id: "main_canvas_container",
        callback: init_cb,
        show_fps: DEBUG,
        console_verbose: DEBUG,
        autoresize: true
    });
}

/**
 * callback executed when the app is initialized
 */
function init_cb(canvas_elem, success) {

    if (!success) {
        console.log("b4w init failure");
        return;
    }

    m_preloader.create_preloader();

    // ignore right-click on the canvas element
    canvas_elem.oncontextmenu = function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };


    canvas_elem.addEventListener("mousedown", main_canvas_down);
    canvas_elem.addEventListener("touchstart", main_canvas_down);
    canvas_elem.addEventListener("mouseup", main_canvas_up);
    canvas_elem.addEventListener("touchend", main_canvas_up);
    canvas_elem.addEventListener("mousemove", main_canvas_move);
    canvas_elem.addEventListener("touchmove", main_canvas_move);

    window.onresize = m_cont.resize_to_container;
    m_cont.resize_to_container();

    load();
}

/*
Si on appuie sur controle, on passe en mode selection
Sinon, on passe en mode translation

Mode translation:
Si un objet est picked, on fait la translation, sinon on fait la rotation de la scene
*/
function main_canvas_down(e) {

  if (e.preventDefault)
      e.preventDefault();

  _obj = m_scenes.pick_object(e.offsetX, e.offsetY);
  console.log(_obj);

  //Appuie t'on en clic droit? Si oui, selection
  if (e.button==2) {
    if(_obj!=null){
      //Adapt the checkbox
      var id = m_scenes.get_object_name(_obj);
      //Multiselection avec controle
      if(e.ctrlKey){
        if (SELECTION.includes(_obj)){
          $("#" + id).find("input").prop("checked", false);
          var i = SELECTION.indexOf(_obj);
          if(i != -1) {
            SELECTION.splice(i, 1);
          }
          m_scenes.set_outline_intensity(_obj, 0);
        }
        else{
          $("#" + id).find("input").prop("checked", true);
          SELECTION.push(_obj);
          m_scenes.set_outline_intensity(_obj, 1);
        }
      }
      //Singleselection sans
      else{
        //Dans tous les cas, on vire tout le monde
        $("#" + id).siblings().find("input").prop("checked", false);
        for(i = 0 ; i < SELECTION.length ; i++){
          m_scenes.set_outline_intensity(SELECTION[i], 0);
        }
        if (SELECTION.includes(_obj)){
          if (SELECTION.length > 1){
            $("#" + id).find("input").prop("checked", true);
            SELECTION = [_obj];
            m_scenes.set_outline_intensity(_obj, 1);
          }
          else{
            $("#" + id).find("input").prop("checked", false);
            SELECTION = [];
          }
        }
        else{
          $("#" + id).find("input").prop("checked", true);
          SELECTION = [_obj];
          m_scenes.set_outline_intensity(_obj, 1);
        }

      }

    }
  }
  //Sinon, on tourne ou on translate/rotate
  else{
    //Si l'objet sous la souris n'est pas sélectionné
    if( _obj==null || !SELECTION.includes(_obj) ){
      _drag_mode = false;
    }
    //Si l'objet est sélectionné, on active le drag mode
    else{

      if (SELECTION.length>0) {
        m_app.disable_camera_controls();
        var cam = m_scenes.get_active_camera();

        //Si on appuie sur controle, on rotate
        if(e.ctrlKey){
          _rotate_mode = true;


          //Get the clicked point
          var pline = m_cam.calc_ray(cam, e.offsetX, e.offsetY, _pline_tmp);
          var camera_ray = m_math.get_pline_directional_vec(pline, _vec3_tmp);
          var cam_trans = m_trans.get_translation(cam, _vec3_tmp2);
          m_math.set_pline_initial_point(_pline_tmp, cam_trans);
          m_math.set_pline_directional_vec(_pline_tmp, camera_ray);
          var point = m_math.line_plane_intersect(FLOOR_PLANE_NORMAL, -1.1, _pline_tmp, _vec3_tmp3);

          _vec3_tmp3 = m_trans.get_translation(_obj);
          m_vec3.subtract(point, _vec3_tmp3, _rotation_origin_vector);
          console.log(point, _vec3_tmp3, _rotation_origin_vector);
        }
        else{
          _drag_mode = true;

          m_trans.get_translation(_obj, _vec3_tmp);
          m_cam.project_point(cam, _vec3_tmp, _obj_delta_xy);
          _obj_delta_xy[0] = e.offsetX - _obj_delta_xy[0];
          _obj_delta_xy[1] = e.offsetY - _obj_delta_xy[1];
        }

      }
    }
  }


}

function main_canvas_up(e) {
    _drag_mode = false;
    _rotate_mode = false;
    // enable camera controls after releasing the object
    //if (!_enable_camera_controls) {
        m_app.enable_camera_controls();
        _obj = null;
    //    _enable_camera_controls = true;
    //}
}


function main_canvas_move(e) {
  if (_drag_mode){

    // calculate viewport coordinates
    var cam = m_scenes.get_active_camera();

    var x = e.offsetX;
    var y = e.offsetY;

    if (x >= 0 && y >= 0) {
      x -= _obj_delta_xy[0];
      y -= _obj_delta_xy[1];

      // emit ray from the camera
      var pline = m_cam.calc_ray(cam, x, y, _pline_tmp);
      var camera_ray = m_math.get_pline_directional_vec(pline, _vec3_tmp);

      // calculate ray/floor_plane intersection point
      var cam_trans = m_trans.get_translation(cam, _vec3_tmp2);
      m_math.set_pline_initial_point(_pline_tmp, cam_trans);
      m_math.set_pline_directional_vec(_pline_tmp, camera_ray);
      var point = m_math.line_plane_intersect(FLOOR_PLANE_NORMAL, -1.1, _pline_tmp, _vec3_tmp3);


      // do not process the parallel case and intersections behind the camera
      //if (point && camera_ray[2] < 0) {
      //    m_trans.set_translation_v(obj_parent, point);
      //else
      var offset = new Float32Array(3);
      m_vec3.subtract(point, m_trans.get_translation(_obj), offset);
      console.log(offset);

      for(i = 0 ; i < SELECTION.length ; i++){
        var newPos = new Float32Array(3);
        m_vec3.add(m_trans.get_translation(SELECTION[i]), offset, newPos);
        // = m_trans.get_translation(SELECTION[i], _vec3_tmp2);
        m_trans.set_translation_v(SELECTION[i], newPos);
      }
    }
  }

  if(_rotate_mode){
    //Get the clicked point
    var cam = m_scenes.get_active_camera();
    var pline = m_cam.calc_ray(cam, e.offsetX, e.offsetY, _pline_tmp);
    var camera_ray = m_math.get_pline_directional_vec(pline, _vec3_tmp);
    var cam_trans = m_trans.get_translation(cam, _vec3_tmp2);
    m_math.set_pline_initial_point(_pline_tmp, cam_trans);
    m_math.set_pline_directional_vec(_pline_tmp, camera_ray);
    var point = m_math.line_plane_intersect(FLOOR_PLANE_NORMAL, -1.1, _pline_tmp, _vec3_tmp3);

    //Get the new vector
    var currentVector = new Float32Array(3);
    _vec3_tmp3 = m_trans.get_translation(_obj);
    m_vec3.subtract(point, _vec3_tmp3, currentVector);

    //Get the angle
    var angle = m_vec3.angle(currentVector, _rotation_origin_vector);

    //Get the orientation
    var diff = new Float32Array(3);
    m_vec3.subtract(currentVector, _rotation_origin_vector, diff);
    var dot   = m_vec3.dot(diff, [0,0,1]);
    var cross = new Float32Array(3);
    m_vec3.cross(diff, [0,0,1], cross);

    m_trans.rotate_z_local(_obj, Math.sign(cross[0])*angle);
    _rotation_origin_vector = currentVector;

    console.log(angle, dot, cross);
  }
}



/**
 * load the scene data
 */
function load() {
    m_data.load(APP_ASSETS_PATH + "numero.json", load_cb, preloader_cb);
}

/**
 * update the app's preloader
 */
function preloader_cb(percentage) {
    m_preloader.update_preloader(percentage);
}

/**
 * callback executed when the scene data is loaded
 */
function load_cb(data_id, success) {

    if (!success) {
        console.log("b4w load failure");
        return;
    }

    m_app.enable_camera_controls();

    // place your code here
    //m_mouse.enable_mouse_hover_outline();

    var cube = m_scenes.get_object_by_name("cube");

    m_scenes.hide_object(cube);

    //Add an object to the scene
    $(".model_button").click(function(){

      var id = $(this).attr("id");
      var clicked = $(this);

      $.get( "https://134.157.66.221:5003/models/" + id, function( answer ) {

        var scene_object_list = m_scenes.get_all_objects("MESH");

        //console.log(answer.data["vbo"]);
        //copy the cube object, change its vbos and show it

        var obj = m_objects.copy(cube, id, true);
        var ibo = new Uint32Array(answer.data["ibo"]);
        var vbo = new Float32Array(answer.data["vbo"]);
        m_geo.override_geometry(
          obj,
          "logo",
          ibo,
          vbo,
          false
        );
        m_scenes.append_object(obj);
        m_transform.set_translation(obj, 0, 0, 1.1);
        //m_objects.remove_object(new_obj);
        m_scenes.show_object(obj);
        m_scenes.update_scene_materials_params();

        //Remove the object from the list, and put it in the loaded section
        clicked.remove();
        var prefix = '<label id="' + id + '" class="panel-block"><input type="checkbox">';
        var suffix = "</input></label>";
        $("#modelsloaded").append(prefix + id + suffix);

        $("#" + id).find("input").bind('change', function(){
          var val = $(this).prop("checked");
          obj = m_scenes.get_object_by_name(id);
          if (val == true){
            SELECTION.push(obj);
            m_scenes.set_outline_intensity(obj, 1);
          }
          else{
            var i = SELECTION.indexOf(obj);
            if(i != -1) {
            	SELECTION.splice(i, 1);
            }
            m_scenes.set_outline_intensity(obj, 0);
          }
          console.log(SELECTION);

        });

      });




    });

}

//Save and load functions
exports.save_state = function(message, settings){

  //Placeholders authentification
  var _user = settings.user;
  var _pwd  = settings.pwd;
  var _repo = settings.repo;
  var _file = settings.file;
  var _sha  = settings.sha;

  //Create the content
  var content="";
  var scene_object_list = m_scenes.get_all_objects("MESH");
  for (var i = 0 ; i < scene_object_list.length ; i++){
    if(scene_object_list[i].name!="cube" && scene_object_list[i].name!="Plane"){
      var mat = m_trans.get_matrix(scene_object_list[i]);
      var output = scene_object_list[i].name + "," + mat.toString();
      content+=output + "\n";
    }
  }

  //Get the current sha for the file
  $.get(

    "https://api.github.com/repos/" + _user + "/"+_repo+"/contents/"+_file,

    function( answer ) {
      _sha = answer.sha;
      //Make the final request
      var _data = {
        "path": _file,
        "message": message,
        "content": btoa(content),
        "sha": _sha,
      };
      $.ajax({
        url: "https://api.github.com/repos/" + _user + "/" + _repo + "/contents/"+_file,
        data: JSON.stringify(_data),
        contentType: "application/json",
        type: 'PUT',
        beforeSend: function(request) {
          request.setRequestHeader("Authorization", "Basic " + btoa(_user + ":" + _pwd));
        },
        success: function(result) {
          $("#button_save").removeClass("is-loading");
          $(".modal").removeClass("is-active");
        },
        error: function(jqXHR, textStatus, errorThrown) {
          console.log(" I did not did it:", jqXHR, textStatus, errorThrown);
        }
      });
    }
  );



}
exports.load_state = function(settings){


  var scene_object_list = m_scenes.get_all_objects("MESH");
  var OBJStoDel = [];
  for (var i = 0 ; i < scene_object_list.length ; i++){
    if(scene_object_list[i].name!="cube" && scene_object_list[i].name!="Plane"){
      OBJStoDel.push(scene_object_list[i]);
    }
  }
  for (var i = 0 ; i < OBJStoDel.length ; i++){
    var id = m_scenes.get_object_data_id(OBJStoDel[i]);
    m_scenes.remove_object(OBJStoDel[i]);
    //m_data.unload(id);
  }

  //Placeholders authentification
  var _user = settings.user;//"norgeotloic";
  var _repo = settings.repo;//"test";
  var _file = settings.file;//"save.csv";
  var _sha  = settings.sha;//null;

  //Get the current sha for the file
  $.ajax({
    url: "https://api.github.com/repos/" + _user + "/"+_repo+"/git/blobs/"+_sha,
    success: function( answer ) {
      var result = atob(answer.content).split("\n");
      //create the ids and mats table
      var IDs  = [];
      var MATs = [];
      for(i = 0 ; i < result.length ; i++){
        var line = result[i].split(",");
        if(line.length > 2){
          IDs.push(line[0]);
          var mat = new Float32Array(16);
          for ( var j = 0 ; j < 16 ; j++ ){
            mat[j] = parseFloat(line[j+1]);
          }
          MATs.push(mat);
        }
      }


      //Import everything
      for(var k = 0 ; k < IDs.length ; k++){
        $.ajax({
          url: "https://134.157.66.221:5003/models/" + IDs[k],
          success: function( ans ) {

            //Import the model
            var cube = m_scenes.get_object_by_name("cube");
            var obj = m_objects.copy(cube, IDs[k], true);
            var ibo = new Uint32Array(ans.data["ibo"]);
            var vbo = new Float32Array(ans.data["vbo"]);
            m_geo.override_geometry(
              obj,
              "logo",
              ibo,
              vbo,
              false
            );
            m_scenes.append_object(obj);
            m_transform.set_matrix(obj, MATs[k]);
            //m_objects.remove_object(new_obj);
            m_scenes.show_object(obj);
            m_scenes.update_scene_materials_params();

            //Make the lists correspond
            //Removing from the list
            $(".model_button").each(function(){
              if($(this).attr("id") == IDs[k]){
                $(this).remove();
              }
            })
            //Adding to the loaded setion
            var prefix = '<label id="' + IDs[k] + '" class="panel-block"><input type="checkbox">';
            var suffix = "</input></label>";
            $("#modelsloaded").append(prefix + IDs[k] + suffix);
            $("#" + IDs[k]).find("input").bind('change', function(){
              var localId = $(this).parent().attr("id");
              console.log(localId);
              var val = $(this).prop("checked");
              var objlocal = m_scenes.get_object_by_name(localId);
              if (val == true){
                SELECTION.push(objlocal);
                m_scenes.set_outline_intensity(objlocal, 1);
              }
              else{
                var i = SELECTION.indexOf(objlocal);
                if(i != -1) {
                	SELECTION.splice(i, 1);
                }
                m_scenes.set_outline_intensity(objlocal, 0);
              }
              console.log(SELECTION);
            });

          },
          async: false
        });
      }
      $("#button_load").removeClass("is-loading");
      $(".modal").removeClass("is-active");
    }
  });

}


});

// import the app module and start the app by calling the init method
b4w.require("numero_main").init();
