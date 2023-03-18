---
date: 3/11/2023
title: Argus Overview 
categories:
  - Overview
author_staff_member: Adrian Chen
---

Argus is the capstone project for the Open-Source Senior Design course at Purdue University. On the team is Ainesh Sootha, Justin Chan and Adrian Chen. You can find it hosted <a href="https://github.com/adrianchen8662/argus" target="_blank">on Github</a>. Track our progress <a href="https://github.com/users/adrianchen8662/projects/2/views/1" target="_blank">here</a>. 

## How Argus Works

Filler text.

## What's the Point of Argus? 

Current providers are able to detect movement, but cannot tell what caused that movement. Argus seeks to be able to leverage computer vision to recognise what is being seen, and notifies the user accordingly. Current providers of home security also use centralized servers, creating questions about what the data is being used, as the cameras on a security system must naturally be on at all times. Argus provides a self-hosted alternative in a lightweight package that can run on basic hardware. See the recommended specs here[insert hyperlink here to the github readme, specifially the spec subsection]. 

## Building and installing Argus
[To be determined. The packaging solution has not been decided yet, as there are multiple languages being used.]

## Using Argus
[To be determined. The frontend of both the server and doorbell are currently in development.]

## What's Next? 

### Pet Recogntion

A proposed feature that was cut was to detect household pets using the color of the pet as an identifier. However, this is extremely dependent on the lighting at the time. Current computer vision almost always uses grayscale for detecting features and assigning landmarks to be less reliant on lightning. Detecting colors in a changing lighting environment would be very difficul. Current open-source implementations do not have a solution for computer vision recognition of pets, and training our own data would be very difficult. Right now, automated pet doors use a key fob system, where a small fob on the pet's collar opens a door using NFC technology. 

### Live video feed

The current implementation waits until OpenCV is confident enough that there is a face looking at the camera before capturing a frame and sending to the server. Instead, a live video and audio feed could be implemented to allow for the user to view from the website. When a face is detected, the current implementation lags for about a second to save, encrypt and send the frame. This would cause issues for a video stream if it were constantly being interrupted with notifications. Thus, there could be two modes present in the doorbell. The first mode, Live Feed mode, enables a video and audio connection, but does not send notifications. The second mode, Sentry mode, cannot send video and audio, but is able to send notifications. 
This creates the problem that the server now has to be able to signal the doorbell to enable either mode. A separate thread or function would have to be awake to receive the signal. 
Another problem is how much FPS to support in the video and audio feed, along with what codec to use. The codec needs more research, but should be lightweight. The FPS should be capped to around 15 fps, as any less would be unintelligible for seeing movement, and any higher would be too heavy for the doorbell and a possibly weak connection between the doorbell and the server to handle, along with being unneccessary. 

### Multithreading (doorbell)

Current Raspberry Pi's have multiple cores and threads, while the current code only takes advantage of a single thread. For better performance and power consumption, the doorbell code could be split into multiple threads, where one thread manages the detection of faces and storage. Once a new image is stored, a separate thread encodes and sends the image. Another separate thread handles the singalling for the proposed Live Feed mode. 

## Credits
### Team Members
[Ainesh Sootha](https://ainesh.co/)  
[Adrian Chen](https://adrianchen8662.github.io/)  
Justin Chan  

### Professor for ECE 49595
Santiago Torres-Arias

### Software Used
[Compreface](https://github.com/exadel-inc/CompreFace) - Used in the server for facial recognition and storage  
[OpenCV](https://github.com/opencv/opencv) - Used in the doorbell for quick detection of faces  
[ReactJS](https://github.com/facebook/react) - Used for the frontend for the doorbell and server  
[Python3](https://github.com/python/cpython) - Used for the backend for the doorbell and server  

For a more comprehensive list of software used, such as libraries, check out the [bill of materials](). 

## License
This project is released under the [GPL-3.0 license](https://github.com/adrianchen8662/argus/blob/main/LICENSE). For the full software bill of materials, SBOM, please see this document.