---
date: 2023-03-18
title: Doorbell Design Choices 
categories:
  - Doorbell
author_staff_member: Adrian Chen
---

When designing the implementation for the doorbell on Argus, some design choices were made that aren't othorodox or clear on why the particular solution was chose. This blog post serves to explain those design choices. 

## Why Use AES Encryption Instead Of HTTPS?
In the current implementation of Argus, the image is encoded using AES on the doorbell, then sent to the server. The key and iv are generated from a password by taking the first 16 and last 16 bytes(subject to change, as it's not entirely secure). By having the same password on the server and the doorbell, then the image is able to be encryped and decrypted, preventing others from seeing what content is being sent. 
Why do this instead of HTTPS? The benefits of HTTPS lie in that the password doesn't have to be set on both the server and doorbell. 

Here's proof that encrypting the packet content using AES is just as secure as using HTTPS. Here's a packet the doorbell sent to the server, captured using Wireshark. 
[Wireshark instance of the packets sent using AES Encryption]

Here's a packet for my computer connecting to the front page of this website using an HTTPS get request, and the subsequent return. 
[Wireshark instance of the packets sent using HTTPS]

Later, if live video and audio is implemented, then there would have to be changes, since having AES encrypt a stream would be needlessly difficult. For more information about the possible live video implementation, check out [this blog post](https://adrianchen8662.github.io/overview/2023/03/11/Argus-Overview/) in the what's next section. 

## Why Are We Using Only OpenCV On The Doorbell?

## Why are 