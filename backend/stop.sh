#!/bin/sh
pkill -f "node (crm|mail|engine|warehouse)\.js" ; pkill -f "mops/server.js" ; pkill -f "backend/demo.js" ; true
