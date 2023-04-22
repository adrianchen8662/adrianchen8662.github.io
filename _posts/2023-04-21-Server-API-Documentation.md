---
date: 2023-04-21
title: Server API Documentation
categories:
  - Server
  - Documentation
author_staff_member: Adrian Chen
---

The server API serves as the endpoint for the doorbell and to serve information to the frontend. 

![API Schematic](https://i.imgur.com/xkwODzj.png)

## GetLogs
### /getlogs  
Get request  
Returns the entire metadata log  

## GetStatus
### /getstatus  
Get request  
Gets the connection status of doorbell and server and server to database  

## GetMetadata
### /getmetadata?timestamp={timestamp}  
Get request  
Returns the metadata for a specific file

## PostImage
### /postimage  
Post request  
Receives an image from the doorbell and processes it  

## AssignFamilyToImage
### /assignfamilytoimage?timestamp={timestamp}&member={member}  
Post request  
assigns a family member based on the timestamp

## RemoveFamilyInImage
### /removefamilyinimage?timestamp={timestamp}  
Post request  
Removes a family member in an image, such as if a stranger was misidentified as a family member

## ChangeFamilyInImage
### /changefamilyinimage?timestamp={timestamp}&member={member}  
Post request  
Changes the family member in an image  

## PostNewFamilyMember
### /postnewfamilymember?name={name}  
Post request  
Adds a family member to the family list

## RemoveFamilyMember
### /removefamilymember?name={name}  
Post request  
Removes a family member from the family list

## GetFamilyList
### /getfamilylist  
Get request  
Returns a list of the current family members  
