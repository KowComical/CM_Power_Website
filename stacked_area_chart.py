import streamlit as st
from streamlit_echarts import st_echarts
import json
import base64
import os

# 隐藏所有东西
hide_streamlit_style = """
                <style>
                div[data-testid="stToolbar"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stDecoration"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stStatusWidget"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                #MainMenu {
                visibility: hidden;
                height: 0%;
                }
                header {
                visibility: hidden;
                height: 0%;
                }
                footer {
                visibility: hidden;
                height: 0%;
                }
                </style>
                """
st.markdown(hide_streamlit_style, unsafe_allow_html=True)

categories = {
    'Fossil': ['coal', 'gas', 'oil'],
    'Nuclear': ['nuclear'],
    'Renewables': ['solar', 'wind', 'other', 'hydro']
}

tools_path = './tools'
stacked_area_path = os.path.join(tools_path, 'stacked_area_chart')

ttl_duration = 60 * 60 * 24 + 60 * 10  # 24 hours + 10 minutes in seconds


def main():
    add_logo(os.path.join(tools_path, 'logo_base64.txt'))

    # 添加一个选择排序方式的功能
    with st.container():
        captions = [', '.join([item.title() for item in items]) for items in categories.values()]

        selected_category = st.sidebar.radio(
            'Sort Countries by Energy Category:',
            list(categories.keys()),
            captions=captions
        )

        st.sidebar.info(
            "Note: The sorting logic and displayed values are based on the mean value for each country from the most "
            "recent year.")

    option, ROWS_PER_GRID, PLOT_HEIGHT = get_configuration_for_category(selected_category)

    st_echarts(options=option,
               height=f"{PLOT_HEIGHT * ROWS_PER_GRID * 1.2}px")


@st.cache_data(ttl=ttl_duration)
def load_base64_file(base64_file):
    with open(base64_file, "r") as f:
        b64_string = f.read()
    return b64_string

def add_logo(base64_file):
    b64_string = load_base64_file(base64_file)

    # Insert the Base64 string into the CSS
    st.markdown(
        f"""
        <style>
            [data-testid="stSidebarNav"] {{
                background-image: url(data:image/png;base64,{b64_string});
                background-repeat: no-repeat;
                background-size: 80% auto;
                padding-top: 40px;
                background-position: 20px 20px;
            }}
        </style>
        """,
        unsafe_allow_html=True,
    )

# @st.cache_data(ttl=ttl_duration)
def get_configuration_for_category(category):
    with open(os.path.join(stacked_area_path, f"{category}.json"), "r") as file:
        data = json.load(file)
    return data["option"], data["ROWS_PER_GRID"], data["PLOT_HEIGHT"]


if __name__ == '__main__':
    with st.spinner('Loading page...'):
        main()
