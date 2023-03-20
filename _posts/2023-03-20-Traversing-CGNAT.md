---
date: 2023-03-20
title: Traversing CGNAT 
categories:
  - Server
author_staff_member: Adrian Chen
---

At my current residence, my ISP uses a carrier grade NAT(CGNAT), which means that I have no public ipv4 address to access my server. My ISP also doesn't support ipv6. This documents the solutions available that can bypass a CGNAT for no cost that serve as a stopgap until ipv6 is finally widely supported, as many possible users might have the same issue. 

## Tailscale Funnels
Tailscale Funnels are an alpha feature that allow someone who uses Tailscale in their networking solution to expose a certain port on the open internet. To setup, follow the instructions for the Personal VPN Network - Tailscale setup, and get an invite to the alpha feature. Here's a [reddit thread](https://www.reddit.com/r/Tailscale/comments/105tvgo/the_funnel_invite_request_and_share_thread/) for getting an invite. Then, [follow this setup](https://tailscale.com/kb/1223/tailscale-funnel/). 
Here's what my access control file looks like for reference. 
```json
// Example/default ACLs for unrestricted connections.
{
	// Declare static groups of users beyond those in the identity service.
	"groups": {
		"group:can-funnel": ["<my-email>@gmail.com"],
	},

	// Declare convenient hostname aliases to use in place of IP addresses.
	"hosts": {
		"example-host-1": "100.100.100.100",
	},

	// Access control lists.
	"acls": [
		// Match absolutely everything.
		// Comment this section out if you want to define specific restrictions.
		{"action": "accept", "users": ["*"], "ports": ["*:*"]},
	],
	"nodeAttrs": [
		{
			// Funnel policy, which lets tailnet members control Funnel
			// for their own devices.
			// Learn more at https://tailscale.com/kb/1223/tailscale-funnel/
			"target": ["group:can-funnel"],
			"attr":   ["funnel"],
		},
	],
	"ssh": [
		// The default SSH policy, which lets users SSH into devices they own.
		// Learn more at https://tailscale.com/kb/1193/tailscale-ssh/
		{
			"action": "check",
			"src":    ["autogroup:members"],
			"dst":    ["autogroup:self"],
			"users":  ["autogroup:nonroot", "root"],
		},
	],
}
```
Then, run the command
```
tailscale serve https:443 / http://127.0.0.1:(The port of the service you want to expose)
```
then 
```
tailscale funnel 443 on
```
to enable the funnel. You can create 3 funnels on 443, 8443 and 10000 for three services at the moment. There might be ways to implement more than 3 funnels using the TCP command, but I could not figure it out. 
The best thing is, Tailscale funnels come with DNS, TLS cert, and HTTPS, which makes it pretty secure. 

Note, this is an alpha feature. The commands and availability are subject to change. This guide was made with Tailscale 1.38, and check the changelog and guides on Tailscale's documentation to make sure what I wrote is right. 

## VPS Tunnelling
There are many ways to use a virtual private server(VPS) for CGNAT traversal. This is [the one](https://github.com/mochman/Bypass_CGNAT) I would recommend to follow, specifically the setup for Oracle Cloud. Oracle provides an Always Free tier that's very generous, and more than enough to run a simple tunneling setup. Be careful on this though, and make sure your reverse proxy is in place, as this exposes your computer to the entire internet. 

## Personal VPN Network
If you are the only one using the network, or your users are willing to install a VPN on their devices, then deploying your own VPN network would work very well to traverse a CGNAT. Two solutions, Tailscale and Zerotier, are the products I would recommend. They are based on Wireguard, but are very different in user friendliness and customization. Tailscale is the easier way, and Zerotier is the harder way. I would not recommend doing your own Wireguard setup, since that's a lot harder and the overhead of the two products is minimal. 

### Tailscale
To setup your own network on Tailscale, go to their [downloads](https://tailscale.com/download/) page and download the version that your server is running on and create an account with Tailscale. 
For people running Docker, there is a docker image available on [Docker Hub](https://hub.docker.com/r/tailscale/tailscale). There's also a [Dockerfile](https://github.com/tailscale/tailscale/blob/main/Dockerfile). 
After installing, running Tailscale will lead you to a login link, where you connect that computer to your account. You will then be able to access a Tailscale network with IP addresses that look like 100:xxx:xxx:xxx. These are IP addresses that are only accessible for the devices in your network, and nowhere else. Connect other devices on here, and use those IP addresses to access your server through a CGNAT.  

### Zerotier
I haven't personally used Zerotier, since Tailscale provies Funnels. To setup your own network on Zerotier, they have excellent documentation on installing [here](https://www.zerotier.com/download/) and using[here](https://docs.zerotier.com/getting-started/getting-started). 