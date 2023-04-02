---
date: 2023-04-01
title: Doorbell Design Choices 
categories:
  - Doorbell
author_staff_member: Adrian Chen
---

When designing the implementation for the doorbell on Argus, some design choices were made that aren't othorodox or clear on why the particular solution was chose. This blog post serves to explain those design choices. 

## Why Use AES Encryption Instead Of HTTPS?
In the current implementation of Argus, the image is encoded using AES on the doorbell, then sent to the server. The key and iv are generated from a password by taking the first 16 and last 16 bytes(subject to change, as it's not entirely secure). By having the same password on the server and the doorbell, then the image is able to be encryped and decrypted, preventing others from seeing what content is being sent. 
Why do this instead of HTTPS? The benefits of HTTPS lie in that the password doesn't have to be set on both the server and doorbell. 

### Here's proof that encrypting the packet content using AES is just as secure as using HTTPS. Here's a packet the doorbell sent to the server, captured using Wireshark.  
![Wireshark to the server, header packet](https://i.imgur.com/Az17pws.png)
In the header, we get local ip address that my computer uses, and the destination ip address of where its headed. The header is not encoded, so we also see some information about the size of the image and a separator, which you can see in the code as plaintext. 

### Here's where the image is being sent
![Wireshark to the server, content packet](https://i.imgur.com/h5YRVxg.png)
The packet was captured by Wireshark, but it cannot be decoded as the image is encrypted. 

### Here's a packet for my computer connecting to Google using an HTTPS get request. 
![Wireshark to Google](https://i.imgur.com/9mff5E8.png)
The packet sent to google contains the same amount of information as encrypting the payload ourselves. The packet has an initial ack that also has information about the source and destination IP, and the subsequent payload is protected. The only extra information I divulge is the size of the image, but that doesn't help in decoding the image as the key and iv are not sent. 

Later, if live video and audio is implemented, then there would have to be changes, since having AES encrypt a stream would be needlessly difficult. For more information about the possible live video implementation, check out [this blog post](https://adrianchen8662.github.io/overview/2023/03/11/Argus-Overview/) in the what's next section. 

## Why Are We Using Only OpenCV On The Doorbell?
The reason why we are only using OpenCV on the doorbell and not doing family recognition or logo detection is because we wanted to keep the doorbell as computationally efficient as possible to both lower powerdraw and to allow the doorbell to be run on as low of a spec hardware as possible. Currently, it looks to be possible to run on a Raspberry Pi Model B or a Raspberry Pi Zero, allowing for a tiny DIY doorbell around the cost of $20. Moving the computationally heavy components off of the doorbell and onto a home server that can run things much more efficiently and allow for greater storage options makes much more sense than having a bulky, hard to manage doorbell all on its own. 