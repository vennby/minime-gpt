from django.shortcuts import render

# Create your views here.
def blackboard(request):
    return render(request, "blackboard.html")