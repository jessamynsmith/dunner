import os
import sys
from sqlalchemy import Column, ForeignKey, Integer, String, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy import create_engine
import psycopg2

Base = declarative_base()

class Users(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key = True)
    name = Column(String, nullable = False)
    email = Column(String, nullable = False)
    phone = Column(String(80))
    recent_selections = Column(String, default='null')

class Recipes(Base):
    __tablename__ = 'recipes'
    id = Column(Integer, primary_key=True)
    name = Column(String(250), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'))

class Ingredients(Base):
    __tablename__ = 'ingredients'
    id = Column(Integer, primary_key=True)
    name = Column(String(250), nullable=False)
    number = Column(Float)
    units = Column(String(250))
    recipe_id = Column(Integer, ForeignKey('recipes.id'))

class Directions(Base):
    __tablename__ = 'directions'
    id = Column(Integer, primary_key=True)
    description = Column(String)
    duration = Column(Float)
    recipe_id = Column(Integer, ForeignKey('recipes.id'))

engine = create_engine(os.environ.get('DATABASE_URL'))

Base.metadata.create_all(engine)