<h1 align="center"> MinimēGPT </h1>

<p align="center"> An isolated writing environment, just like the good old times. </p>

<img src="https://www.hindustantimes.com/static-content/1y/2024/ghibli/assets//YusnTOKCjx/58703d343b997fdfde3bc0fb8c80616b32e6fb3d_hq.gif" width="2000">

<h3> TLDR; What is <b>MinimēGPT</b>?</h3>
<ul>
  <li>Automation tool for quickly building tailor-made resumes for applying to different domains or roles</li>
  <li>Maintains complete database of profile and dynamically generates resume based on user's selections</li>
  <li>Has a user authentication system, keeps records of all resumes made in the past and allows for browsing</li>
</ul>

### Why'd I build it?
<p align="justify"> 
  I remember when I was a student juggling multiple assignments and tasks at the same time, and I remember being able to get it all done. I remember the feelings of pure joy and the surge of self-trust and confidence that came from being able to handle everything myself, without needing help, ever. Now, I see over-reliance on a glorified statistical word-predictor, one that causes diminished critical thinking skills and academic dishonesty, and I felt like I had to do something about it.
</p>

### How to run it?

1. Clone the repo, download it, do whatever you'd like to set it up in your code editor.

    ```bash
    git clone https://github.com/vennby/minime-gpt.git
    cd easy-cv
    ```

2. Then, simply run this to first install the necessary libraries all at once.

    ```bash
    pip install -r requirements.txt
    ```

3. Since this is a Flask application, this command should do the job.

    ```bash
    flask run
    ```

```
MinimēGPT/
├── backend/
│   ├── app.py
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── editor.js
│   └── style.css

```