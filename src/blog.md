---
title: Blog
layout: "base.njk"
---
{% for post in collections.post %}
- <a href="{{ post.url }}"> {{post.date | date: "%Y-%m-%d"}}:  {{ post.data.title }} </href>
{% endfor %}