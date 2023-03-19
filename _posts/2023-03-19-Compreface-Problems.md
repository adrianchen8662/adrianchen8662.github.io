---
date: 2023-03-19
title: Compreface Problems
categories:
  - Server
author_staff_member: Adrian Chen
---

The original Compreface had many issues. This blog documents those issues and how they were solved. 

## Performance Issues

In Compreface, there are different custom builds that the user can install(more information [here](https://github.com/exadel-inc/CompreFace/blob/master/docs/Custom-builds.md) on custom builds and a list of custom builds[here](https://github.com/exadel-inc/CompreFace/blob/master/custom-builds/README.md)). The original version, FaceNet, was extremely memory and CPU intensive, with one instance crashing my computer. 

Here's the performance of compreface-core, the main container running image processing. A REST API call was made to push an image to Compreface, and for it to store that image. The memory usage jumps to 900 MB, and CPU usage was pegged at 100% for 5 seconds as it processed the image. 

![FaceNet Performance - Facial Storage](https://i.imgur.com/7s2sEs6.png)

This is the performance of compreface-core when asked to identify the face of a new image, also made through a REST API call. The memory usage now jumps up to 1.7 Gigabytes, and CPU usage was pegged at 100% for 5 seconds. 

![FaceNet Performance - Facial Recognition](https://i.imgur.com/7GfSbwo.png)

While this might not seem like much, there are other things running at the same time as Compreface for Argus, like the webserver and ingress server. Reducing this number is important to making sure that our product is able to run on as many systems as possible. 

Instead of using FaceNet for our product, therefore, I decided that using Mobilenet, a more lightweight version, would help to reduce the CPU and memory usage. While the Face recogintion model and accuracy is worse in certain datasets, the overall accuracy is still good enough. The change to AVX2 instructions is also not a huge concern, as it has been supported by Intel processors since Q2 2013 Haswell processors, and AMD Q2 2015 Excavator processors. 

Here's the performance of compreface-core when storing a face, now running Mobilenet. 

![MobileNet Performance - ]()

Here's the performance of compreface-core when identifying a face on Mobilenet. 

![MobileNet Performance - ]()

## Packaging Something that Needs Docker

[filler text]