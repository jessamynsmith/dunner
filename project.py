from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from sqlalchemy import create_engine, func, and_
from sqlalchemy.orm import sessionmaker
from recipe_database_setup import Base, Users, Recipes, Ingredients, Directions
from flask_mail import Mail, Message
import json

from flask import session as login_session  # login dependencies
import random, string
from oauth2client.client import flow_from_clientsecrets
from oauth2client.client import FlowExchangeError
import httplib2
from flask import make_response
import requests

from tasks import send_async_email   # celery background task

import os

app = Flask(__name__)

engine = create_engine(os.environ.get('DATABASE_URL'))
Base.metadata.bind = engine
DBSession = sessionmaker(bind=engine)
session = DBSession()

app.config['MAIL_SERVER']='smtp.gmail.com'
app.config['MAIL_PORT'] = 465
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
app.config['MAIL_USE_TLS'] = False
app.config['MAIL_USE_SSL'] = True

mail = Mail(app)

CLIENT_ID = json.loads(open('client_secrets.json', 'r').read())['web']['client_id']

sms_gateway_domains = {"ATT":"@txt.att.net", "tMobile":"@tmomail.net", "Verizon":"@vtext.com", "Sprint":"@pm.sprint.com", "USCellular":"@email.uscc.net"}

def createUser(login_session):
    newUser = Users(name=login_session['username'], email=login_session['email'])
    session.add(newUser)
    session.commit()
    user = session.query(Users).filter_by(email=login_session['email']).one()
    return user.id

def getUserID(email):
    try:
        user = session.query(Users).filter_by(email=email).one()
        return user.id
    except:
        return None

@app.route('/')
def land():
    return redirect(url_for('showLogin', _external=True, _scheme='https'))

@app.route('/login')
def showLogin():
    state = ''.join(random.choice(string.ascii_uppercase + string.digits) for x in xrange(32))
    login_session['state'] = state
    return render_template('login.html', STATE=state)

@app.route('/about')
def getAbout():
    return render_template('about.html',STATE=login_session['state'])

@app.route('/gconnect', methods=['POST'])  # auth class
def gconnect():
    if request.args.get('state') != login_session['state']:  # validate state token
        response = make_response(json.dumps('Invalid state parameter.'), 401)
        response.headers['Content-Type'] = 'application/json'
        return response
    code = request.data  # obtain authorization code
    try:  # try to upgrade authorization code into a credentials object
        oauth_flow = flow_from_clientsecrets('client_secrets.json', scope = "")
        oauth_flow.redirect_uri = 'postmessage'
        credentials = oauth_flow.step2_exchange(code)
    except FlowExchangeError:
        response = make_response(json.dumps('Failed to upgrade the authorization code.'), 401)
        response.headers['Content-Type'] = 'application/json'
        return response
    print credentials, 'here are credentials'
    access_token = credentials.access_token  # check that access token is valid.
    url = ('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=%s' % access_token)
    h = httplib2.Http()
    result = json.loads(h.request(url, 'GET')[1])
    if result.get('error') is not None:  # if there was an error in the access token info, abort.
        response = make_response(json.dumps(result.get('error')), 500)
        response.headers['Content-Type'] = 'application/json'
        return response
    gplus_id = credentials.id_token['sub']  # verify that access token is used for the intended user.
    if result['user_id'] != gplus_id:
        response = make_response(json.dumps("Token's user ID doesn't match given user ID."), 401)
        response.headers['Content-Type'] = 'application/json'
        return response
    if result['issued_to'] != CLIENT_ID: # Verify that the access token is valid for this app.
        response = make_response(json.dumps("Token's client ID does not match app's."), 401)
        response.headers['Content-Type'] = 'application/json'
        return response
    stored_credentials = login_session.get('credentials')
    stored_gplus_id = login_session.get('gplus_id')
    if stored_credentials is not None and gplus_id == stored_gplus_id:  # user already logged in
        return ' '
    login_session['credentials'] = access_token   # store loggin_session info (access token, google id, name, email, user id)
    login_session['gplus_id'] = gplus_id
    userinfo_url = "https://www.googleapis.com/oauth2/v1/userinfo"  # get user info
    params = {'access_token': credentials.access_token, 'alt': 'json'}
    answer = requests.get(userinfo_url, params=params)
    data = answer.json()
    login_session['username'] = data['name']
    login_session['email'] = data['email']
    user_id = getUserID(data["email"])
    if not user_id:   # check if user exists.  if not, add user to database.
        user_id = createUser(login_session)
    login_session['user_id'] = user_id
    flash('alert-success')
    flash('Welcome ' + login_session['username'])
    return ' '

@app.route('/gdisconnect',methods=['GET','POST'])
def gdisconnect():
    if request.method == 'POST':
        updateRecentSelections(request.form['last'])
    access_token = login_session.get('credentials')  # Only disconnect a connected user.
    if access_token is None:
        print 'Current user not connected'
    url = 'https://accounts.google.com/o/oauth2/revoke?token=%s' % access_token
    h = httplib2.Http()
    result = h.request(url, 'GET')[0]
    if result['status'] == '200':
        print 'success'
    else:  #  if given token was invalid
        print 'invalid token'
    try:
        del login_session['credentials'] # reset user's session
        del login_session['gplus_id']
        del login_session['username']
        del login_session['email']
        del login_session['user_id']
    except:
        pass
    return redirect(url_for('showLogin'))

def checkRecipeIDs(recipe_ids):  # takes in a list of recipe id's
    legal_recipe_ids = [recipe.id for recipe in session.query(Recipes).filter_by(user_id = login_session['user_id']).all()]
    for recipe_id in recipe_ids:
        if int(recipe_id) not in legal_recipe_ids:
            return False
    return True

def getMe():
    return session.query(Users).filter_by(id=login_session['user_id']).one()

def getRecentSelections():
    return getMe().recent_selections

def getPhoneNumber():
    return getMe().phone

def noneify(string):
    if string != '':
        return string

def addRecipe(recipe):
    title,ingredients,directions=recipe
    recipe = Recipes(name=title, user_id= login_session['user_id'])
    session.add(recipe)
    session.commit()
    recipe_id = recipe.id
    for i in ingredients:
        ingredient = Ingredients(name=i[0],number=noneify(i[1]),units=noneify(i[2]),recipe_id=recipe_id)
        session.add(ingredient)
        session.commit()
    for d in directions:
        direction = Directions(description=d[0],duration=noneify(d[1]),recipe_id=recipe_id)
        session.add(direction)
        session.commit()
    return recipe_id

def deleteRecipes(recipe_ids):
    session.query(Directions).filter(Directions.recipe_id.in_(recipe_ids)).delete(synchronize_session=False)
    session.query(Ingredients).filter(Ingredients.recipe_id.in_(recipe_ids)).delete(synchronize_session=False)
    session.query(Recipes).filter(Recipes.id.in_(recipe_ids)).delete(synchronize_session=False)
    session.commit()

def replaceRecipeId(recipe_id, new_recipe_id):  # updates recent selections if recipe_id is not equal to new_recipe_id (both id's should be strings)
    recent_selections = json.loads(getRecentSelections())
    if recent_selections and recipe_id in recent_selections and recipe_id != new_recipe_id:
        recent_selections[new_recipe_id] = recent_selections.pop(recipe_id)
        updateRecentSelections(json.dumps(recent_selections))

@app.route('/create/edit', methods=['POST'])
def createEdit():
    if 'username' not in login_session:
        return redirect(url_for('showLogin'))
    form = request.form
    referer = request.headers['Referer']
    if 'recipe_id' not in form:  # creating a recipe
        if 'hub' in referer:  # render create/edit page
            updateRecentSelections(form['last'])
            return render_template('create_edit.html',title=None,ingredients=None,directions=None,recipe_id=None)
        new_recipe_id = addRecipe(json.loads(form['recipe'])) # create new recipe
        return str(new_recipe_id)
    recipe_id = int(form['recipe_id'])
    if not checkRecipeIDs([recipe_id]):
        flash('alert-danger')
        flash('The recipes you requested do not exist or belong to someone else.')
        return redirect(url_for('doStuff'))
    if 'hub' in referer:
        updateRecentSelections(form['last'])
        title = session.query(Recipes.name).filter(Recipes.id==recipe_id).one().name
        ingredients = session.query(Ingredients).filter(Ingredients.recipe_id==recipe_id).all()
        directions = session.query(Directions).filter(Directions.recipe_id==recipe_id).all()
        return render_template('create_edit.html',title=title,ingredients=ingredients,directions=directions,recipe_id=recipe_id)
    deleteRecipes([recipe_id])
    new_recipe_id = addRecipe(json.loads(form['recipe']))
    replaceRecipeId(str(recipe_id), str(new_recipe_id))
    return str(new_recipe_id)

def toSeconds(minutes):
    return int(round(minutes*60))

def getEmail(subject, content, recipient):
    msg = Message(subject, sender='dunner.app@gmail.com', recipients=[recipient])
    msg.body = content
    return msg

def sendEmail(subject, content):
    msg = Message(subject, sender='dunner.app@gmail.com', recipients=[login_session['email']])
    msg.body = content
    mail.send(msg)

@app.route('/post-mortem', methods=['POST'])
def displayCorrections():
    form = request.form
    steps = session.query(Recipes, Directions).join(Directions).filter(Directions.id.in_(form.keys())).order_by(Recipes.name, Directions.id).all()
    return render_template('post_mortem.html', corrections=form, steps=steps)

def getSteps(directions, cook_time, durations, relative_finish_times):
    steps = [] # will be populated with duration, description, recipe id, and step id for each step of each recipe
    relative_start_times = {} # will be populated with one relative start time for each recipe
    max_relative_finish_time = max([float(rft) for rft in relative_finish_times.values()])
    for recipe_id in durations:  # get relative start times
        relative_finish_time = float(relative_finish_times[recipe_id])
        distance_to_finish_line = max_relative_finish_time - relative_finish_time
        relative_start_time = toSeconds(cook_time - distance_to_finish_line - max(0,durations[recipe_id]))
        relative_start_times[recipe_id] = relative_start_time + 10  # add 10 second grace period to prepare for first step of first recipe
    old_recipe_id = None
    for direction in directions:  # sort timed steps
        recipe_id = str(direction.recipe_id)
        if recipe_id != old_recipe_id:
            recipe_time = 0
            relative_start_time = relative_start_times[recipe_id]
        step = {}
        step['relative_start_time'] = relative_start_time + toSeconds(recipe_time)
        step['duration'] = toSeconds(direction.duration)
        step['description'] = direction.description
        step['recipe_id'] = recipe_id
        step['id'] = direction.id
        steps.append(step)
        recipe_time+=direction.duration
        old_recipe_id = recipe_id
    steps.sort(key=lambda k: k['relative_start_time'])
    return steps, relative_start_times, toSeconds(cook_time) + 10

@app.route('/cook', methods=['POST'])
def cookRecipes():
    if 'username' not in login_session:
        return redirect(url_for('showLogin'))
    form = json.loads(request.form['start_cooking_now'])
    split_ids = form['recipe_ids']
    if not checkRecipeIDs(split_ids):
        flash('alert-danger')
        flash('The recipes you requested do not exist or belong to someone else.')
        return redirect(url_for('doStuff'))
    updateRecentSelections(form['last'])  # save recent selections
    recipes = session.query(Recipes.id, Recipes.name).filter(Recipes.id.in_(split_ids)).order_by(func.lower(Recipes.name)).all()
    directions = session.query(Directions).filter(and_(Directions.recipe_id.in_(split_ids), Directions.duration.isnot(None))).all()
    steps, start_times, cook_time = getSteps(directions, float(form['cook_time']), form['durations'], form['relative_finish_times'])
    return render_template('cook.html', recipes = recipes, steps = steps, start_times = start_times, recipe_ids = '/'.join(split_ids), cook_time=cook_time)

@app.route('/resetlast', methods=['POST'])
def reset():
    getMe().recent_selections = 'null'
    session.commit()
    return ''

def updateRecentSelections(string):
    getMe().recent_selections = string
    session.commit()

@app.route('/prep', methods=['POST'])
def prepRecipes():
    if 'username' not in login_session:
        return redirect(url_for('showLogin'))
    form = json.loads(request.form['prep-recipes'])
    split_ids = form['recipe_ids']
    if not checkRecipeIDs(split_ids):
        flash('alert-danger')
        flash('The recipes you requested do not exist or belong to someone else.')
        return redirect(url_for('doStuff'))
    selections = form['last']
    updateRecentSelections(selections)
    durations = form['durations']
    if not durations:
        durations = dict(getDurations(split_ids))
    recipes = session.query(Recipes).filter(Recipes.id.in_(split_ids)).order_by(func.lower(Recipes.name)).all()
    ingredients = [session.query(Ingredients).filter(Ingredients.recipe_id == recipe.id).all() for recipe in recipes]
    prep_steps = [session.query(Directions).filter(and_(Directions.recipe_id == recipe.id, Directions.duration.is_(None))).all() for recipe in recipes]
    cook_steps = [session.query(Directions).filter(and_(Directions.recipe_id == recipe.id, Directions.duration.isnot(None))).all() for recipe in recipes]
    return render_template('prep.html', recipes=recipes, ingredients=ingredients, prep_steps=prep_steps, cook_steps=cook_steps, last=json.loads(selections), durations=durations)

@app.route('/email', methods=['POST'])
def Email():
    form = request.json
    sendEmail(form['subject'],form['body'])
    return ''

@app.route('/help',methods=['GET','POST'])
def getHelp():
    if 'username' not in login_session:
        return redirect(url_for('showLogin'))
    if request.method == 'POST':
        updateRecentSelections(request.form['last'])
    referer = request.headers['Referer']
    return render_template('help.html',referer=referer[referer.rfind('/')+1:])

def getDurations(recipe_ids):
    return session.query(Directions.recipe_id,func.sum(Directions.duration)).filter(Directions.recipe_id.in_(recipe_ids)).group_by(Directions.recipe_id).all()

@app.route('/durations', methods=['POST'])
def fetchDurations():  # takes a list of recipe id's and returns recipe_id/duration json object
    return jsonify(getDurations(request.form.getlist('recipe_ids[]')))

@app.route('/schedule', methods=['POST'])
def scheduleReminder():
    form = request.json
    subject = 'Start cooking in ' + form['minutes_notice'] + ' minutes.'
    rfts = form['relative_finish_times']
    length = len(rfts)-1
    body = 'Recipes: '
    for index,recipe in enumerate(rfts):
        if index != length:
            body += recipe + ' (RFT=' + rfts[recipe] + '), '
        else:
            body += recipe + ' (RFT=' + rfts[recipe] + ')\nMeal Time: ' + form['meal_time']
    if 'phone_number' in form:
        recipient=form['phone_number']+sms_gateway_domains[form['phone_carrier']]
        send_async_email.apply_async(args=[getEmail(subject,body,recipient)],countdown=form['seconds_till_reminder'])
        if form['remember_phone']:
            if recipient != getPhoneNumber():
                getMe().phone = recipient
                session.commit()
        else:
            getMe().phone = None
            session.commit()
        return 'Success!  Expect a text.'
    else:
        send_async_email.apply_async(args=[getEmail(subject,body,login_session['email'])],countdown=form['seconds_till_reminder'])
        return 'Success!  Expect an email.'

@app.route('/getphone')
def getPhoneForModal():
    phone = getPhoneNumber()
    if not phone:  # if phone on file = None
        return ''
    else:  # if we have a phone number on file, return to client
        domain = phone[10:]
        for value in sms_gateway_domains:
            if sms_gateway_domains[value] == domain:
                needed_value = value
                break
        return phone[0:3] + '-' + phone[3:6] + '-' + phone[6:10] + ',' + needed_value

@app.route('/debuglogin', methods=['GET','POST'])
def foooo():
    form = request.json
    print form
    return ''

@app.route('/delete', methods=['POST'])
def delete():
    deleteRecipes(request.form.getlist('recipe_ids[]'))
    return ''

@app.route('/hub', methods=['GET','POST'])
def doStuff():
    if 'username' not in login_session:
        return redirect(url_for('showLogin'))
    if request.method == 'POST':
        updateRecentSelections(request.form['last'])
    print 'testing testing testing'
    return render_template('hub.html', recipes = session.query(Recipes).filter_by(user_id = login_session['user_id']).order_by(func.lower(Recipes.name)).all(), last = getRecentSelections())


#if __name__ == '__main__':
app.secret_key = os.environ.get('SECRET_KEY')
app.debug = True
#app.run(host='0.0.0.0', port=5000)
